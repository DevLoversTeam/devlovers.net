import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankRefunds, orders, paymentAttempts } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: vi.fn(async () => ({ id: 'admin:root', role: 'admin' })),
  AdminApiDisabledError: class AdminApiDisabledError extends Error {},
  AdminUnauthorizedError: class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED';
  },
  AdminForbiddenError: class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN';
  },
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/security/rate-limit', async () => {
  const actual = await vi.importActual<any>('@/lib/security/rate-limit');
  return {
    ...actual,
    getRateLimitSubject: vi.fn(() => 'rl_admin_refund_test'),
    enforceRateLimit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
    rateLimitResponse: ({
      retryAfterSeconds,
      details,
    }: {
      retryAfterSeconds: number;
      details?: Record<string, unknown>;
    }) => {
      const res = NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          retryAfterSeconds,
          ...(details ? { details } : {}),
        },
        { status: 429 }
      );
      res.headers.set('Retry-After', String(retryAfterSeconds));
      res.headers.set('Cache-Control', 'no-store');
      return res;
    },
  };
});

vi.mock('@/lib/services/orders', () => ({
  refundOrder: vi.fn(async () => {
    throw new Error('refundOrder should not be called for monobank');
  }),
}));

const cancelInvoicePaymentMock = vi.fn();

vi.mock('@/lib/psp/monobank', () => ({
  cancelInvoicePayment: cancelInvoicePaymentMock,
  PspError: class PspError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
  };
});

const __prevRefundEnabled = process.env.MONO_REFUND_ENABLED;
const __prevAppOrigin = process.env.APP_ORIGIN;

beforeAll(() => {
  process.env.MONO_REFUND_ENABLED = 'true';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  resetEnvCache();
});

afterAll(() => {
  if (__prevRefundEnabled === undefined) delete process.env.MONO_REFUND_ENABLED;
  else process.env.MONO_REFUND_ENABLED = __prevRefundEnabled;

  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;

  resetEnvCache();
});

beforeEach(() => {
  cancelInvoicePaymentMock.mockReset();
});

async function insertOrder(args: {
  orderId: string;
  orderPspChargeId?: string | null;
}) {
  await db.insert(orders).values({
    id: args.orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'released',
    pspChargeId: args.orderPspChargeId ?? null,
    idempotencyKey: crypto.randomUUID(),
  } as any);
}

async function insertAttempt(args: {
  orderId: string;
  providerPaymentIntentId?: string | null;
  metadata?: Record<string, unknown>;
  status?: 'creating' | 'active' | 'succeeded' | 'failed' | 'canceled';
  attemptNumber?: number;
  updatedAt?: Date;
}) {
  await db.insert(paymentAttempts).values({
    id: crypto.randomUUID(),
    orderId: args.orderId,
    provider: 'monobank',
    status: args.status ?? 'succeeded',
    attemptNumber: args.attemptNumber ?? 1,
    currency: 'UAH',
    expectedAmountMinor: 1000,
    idempotencyKey: crypto.randomUUID(),
    providerPaymentIntentId: args.providerPaymentIntentId ?? null,
    metadata: args.metadata ?? {},
    createdAt: args.updatedAt
      ? new Date(args.updatedAt.getTime() - 1_000)
      : undefined,
    updatedAt: args.updatedAt ?? undefined,
  } as any);
}

async function insertOrderAndAttempt(args: {
  orderId: string;
  providerPaymentIntentId?: string | null;
  metadata?: Record<string, unknown>;
  orderPspChargeId?: string | null;
  status?: 'creating' | 'active' | 'succeeded' | 'failed' | 'canceled';
  attemptNumber?: number;
  updatedAt?: Date;
}) {
  await insertOrder({
    orderId: args.orderId,
    orderPspChargeId: args.orderPspChargeId,
  });
  await insertAttempt({
    orderId: args.orderId,
    providerPaymentIntentId: args.providerPaymentIntentId,
    metadata: args.metadata,
    status: args.status,
    attemptNumber: args.attemptNumber,
    updatedAt: args.updatedAt,
  });
}

async function cleanupOrder(orderId: string) {
  await db.delete(monobankRefunds).where(eq(monobankRefunds.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank admin refund route (F4)', () => {
  it('creates processing refund once and dedupes extRef on retry', async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    await insertOrderAndAttempt({
      orderId,
      providerPaymentIntentId: invoiceId,
    });
    cancelInvoicePaymentMock.mockResolvedValue({
      invoiceId,
      status: 'processing',
    });

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req1 = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res1 = await POST(req1, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res1.status).toBe(200);
      const json1: any = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.order.id).toBe(orderId);
      expect(json1.order.paymentStatus).toBe('paid');
      expect(json1.refund.status).toBe('processing');
      expect(json1.refund.extRef).toBe(`mono_refund:${orderId}:full`);
      expect(json1.refund.deduped).toBe(false);

      const req2 = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res2 = await POST(req2, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res2.status).toBe(200);
      const json2: any = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.refund.extRef).toBe(`mono_refund:${orderId}:full`);
      expect(json2.refund.status).toBe('processing');
      expect(json2.refund.deduped).toBe(true);

      expect(cancelInvoicePaymentMock).toHaveBeenCalledTimes(1);
      expect(cancelInvoicePaymentMock).toHaveBeenCalledWith({
        invoiceId,
        extRef: `mono_refund:${orderId}:full`,
        amountMinor: 1000,
      });

      const rows = await db
        .select({
          id: monobankRefunds.id,
          status: monobankRefunds.status,
          extRef: monobankRefunds.extRef,
        })
        .from(monobankRefunds)
        .where(eq(monobankRefunds.orderId, orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('processing');
      expect(rows[0]?.extRef).toBe(`mono_refund:${orderId}:full`);
    } finally {
      await cleanupOrder(orderId);
    }
  }, 15000);

  it('treats requested as retryable, then dedupes once processing', async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    await insertOrderAndAttempt({
      orderId,
      providerPaymentIntentId: invoiceId,
    });

    await db.insert(monobankRefunds).values({
      id: crypto.randomUUID(),
      provider: 'monobank',
      orderId,
      extRef: `mono_refund:${orderId}:full`,
      status: 'requested',
      amountMinor: 1000,
      currency: 'UAH',
      providerCreatedAt: new Date(),
      providerModifiedAt: new Date(),
    } as any);

    cancelInvoicePaymentMock.mockResolvedValue({
      invoiceId,
      status: 'processing',
    });

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req1 = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );
      const res1 = await POST(req1, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res1.status).toBe(200);
      const json1: any = await res1.json();
      expect(json1.refund.status).toBe('processing');
      expect(json1.refund.deduped).toBe(false);

      const req2 = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );
      const res2 = await POST(req2, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res2.status).toBe(200);
      const json2: any = await res2.json();
      expect(json2.refund.status).toBe('processing');
      expect(json2.refund.deduped).toBe(true);
      expect(cancelInvoicePaymentMock).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('returns PSP_UNAVAILABLE and marks refund failure when PSP call fails', async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    await insertOrderAndAttempt({
      orderId,
      providerPaymentIntentId: invoiceId,
    });

    cancelInvoicePaymentMock
      .mockRejectedValueOnce(new Error('Monobank cancel failed'))
      .mockResolvedValueOnce({
        invoiceId,
        status: 'processing',
      });

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json.code).toBe('PSP_UNAVAILABLE');

      const [refundRow] = await db
        .select({
          status: monobankRefunds.status,
          extRef: monobankRefunds.extRef,
        })
        .from(monobankRefunds)
        .where(
          and(
            eq(monobankRefunds.orderId, orderId),
            eq(monobankRefunds.extRef, `mono_refund:${orderId}:full`)
          )
        )
        .limit(1);

      expect(refundRow?.status).toBe('failure');

      const retryReq = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const retryRes = await POST(retryReq, {
        params: Promise.resolve({ id: orderId }),
      });

      expect(retryRes.status).toBe(200);
      const retryJson: any = await retryRes.json();
      expect(retryJson.success).toBe(true);
      expect(retryJson.refund.extRef).toBe(`mono_refund:${orderId}:full`);
      expect(retryJson.refund.status).toBe('processing');
      expect(retryJson.refund.deduped).toBe(false);

      const [orderRow] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.paymentStatus).toBe('paid');
      expect(cancelInvoicePaymentMock).toHaveBeenCalledTimes(2);
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('returns 409 REFUND_DISABLED when gate is off and does not call PSP', async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    await insertOrderAndAttempt({
      orderId,
      providerPaymentIntentId: invoiceId,
    });

    const prev = process.env.MONO_REFUND_ENABLED;
    process.env.MONO_REFUND_ENABLED = 'false';
    resetEnvCache();

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('REFUND_DISABLED');
      expect(cancelInvoicePaymentMock).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.MONO_REFUND_ENABLED;
      else process.env.MONO_REFUND_ENABLED = prev;
      resetEnvCache();
      await cleanupOrder(orderId);
    }
  });

  it('falls back to metadata.invoiceId when providerPaymentIntentId is absent', async () => {
    const orderId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    await insertOrderAndAttempt({
      orderId,
      providerPaymentIntentId: null,
      metadata: { invoiceId },
      orderPspChargeId: null,
    });
    cancelInvoicePaymentMock.mockResolvedValue({
      invoiceId,
      status: 'processing',
    });

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.refund.status).toBe('processing');

      expect(cancelInvoicePaymentMock).toHaveBeenCalledTimes(1);
      expect(cancelInvoicePaymentMock).toHaveBeenCalledWith({
        invoiceId,
        extRef: `mono_refund:${orderId}:full`,
        amountMinor: 1000,
      });
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('prefers succeeded attempt invoice id over newer failed attempt', async () => {
    const orderId = crypto.randomUUID();
    const now = Date.now();
    const goodInvoiceId = `inv_good_${crypto.randomUUID()}`;
    const badInvoiceId = `inv_bad_${crypto.randomUUID()}`;

    await insertOrder({ orderId });

    await insertAttempt({
      orderId,
      providerPaymentIntentId: goodInvoiceId,
      status: 'succeeded',
      attemptNumber: 1,
      updatedAt: new Date(now - 60_000),
    });

    await insertAttempt({
      orderId,
      providerPaymentIntentId: badInvoiceId,
      status: 'failed',
      attemptNumber: 2,
      updatedAt: new Date(now),
    });

    cancelInvoicePaymentMock.mockResolvedValue({
      invoiceId: goodInvoiceId,
      status: 'processing',
    });

    try {
      const { POST } =
        await import('@/app/api/shop/admin/orders/[id]/refund/route');

      const req = new NextRequest(
        `http://localhost/api/shop/admin/orders/${orderId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(200);

      expect(cancelInvoicePaymentMock).toHaveBeenCalledTimes(1);
      expect(cancelInvoicePaymentMock).toHaveBeenCalledWith({
        invoiceId: goodInvoiceId,
        extRef: `mono_refund:${orderId}:full`,
        amountMinor: 1000,
      });
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
