import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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

async function insertOrderAndAttempt(orderId: string) {
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'released',
    idempotencyKey: crypto.randomUUID(),
  } as any);

  await db.insert(paymentAttempts).values({
    id: crypto.randomUUID(),
    orderId,
    provider: 'monobank',
    status: 'succeeded',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: 1000,
    idempotencyKey: crypto.randomUUID(),
    providerPaymentIntentId: `inv_${crypto.randomUUID()}`,
    metadata: {},
  } as any);
}

async function cleanupOrder(orderId: string) {
  await db.delete(monobankRefunds).where(eq(monobankRefunds.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank admin refund route (F4 launch containment)', () => {
  it('returns REFUND_DISABLED even when MONO_REFUND_ENABLED is true', async () => {
    const orderId = crypto.randomUUID();
    await insertOrderAndAttempt(orderId);

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
      expect(json.message).toBe('Refunds are disabled.');
      expect(cancelInvoicePaymentMock).not.toHaveBeenCalled();

      const refundRows = await db
        .select({ id: monobankRefunds.id })
        .from(monobankRefunds)
        .where(eq(monobankRefunds.orderId, orderId));
      expect(refundRows).toHaveLength(0);
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('leaves order state unchanged when refund rail is disabled', async () => {
    const orderId = crypto.randomUUID();
    await insertOrderAndAttempt(orderId);

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

      const [row] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          pspStatusReason: orders.pspStatusReason,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row?.paymentStatus).toBe('paid');
      expect(row?.status).toBe('PAID');
      expect(row?.inventoryStatus).toBe('released');
      expect(row?.pspStatusReason).toBeNull();
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
