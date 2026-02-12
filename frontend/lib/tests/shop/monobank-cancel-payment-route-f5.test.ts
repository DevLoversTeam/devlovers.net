import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  inventoryMoves,
  monobankPaymentCancels,
  orders,
  paymentAttempts,
  products,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: vi.fn(async () => {}),
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

const removeInvoiceMock = vi.fn();

vi.mock('@/lib/psp/monobank', () => ({
  removeInvoice: removeInvoiceMock,
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
    logInfo: () => {},
  };
});

let postRoute: typeof import('@/app/api/shop/admin/orders/[id]/cancel-payment/route').POST;

const __prevAppOrigin = process.env.APP_ORIGIN;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevMonoToken = process.env.MONO_MERCHANT_TOKEN;

beforeAll(async () => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_MERCHANT_TOKEN = 'test_mono_token';
  resetEnvCache();

  ({ POST: postRoute } = await import(
    '@/app/api/shop/admin/orders/[id]/cancel-payment/route'
  ));
});

afterAll(() => {
  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;

  if (__prevPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
  else process.env.PAYMENTS_ENABLED = __prevPaymentsEnabled;

  if (__prevMonoToken === undefined) delete process.env.MONO_MERCHANT_TOKEN;
  else process.env.MONO_MERCHANT_TOKEN = __prevMonoToken;

  resetEnvCache();
});

beforeEach(() => {
  removeInvoiceMock.mockReset();
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_MERCHANT_TOKEN = 'test_mono_token';
  resetEnvCache();
});

async function insertProductWithReservedStock(orderId: string) {
  const productId = crypto.randomUUID();
  await db.insert(products).values({
    id: productId,
    slug: `f5-${productId}`,
    title: 'F5 Product',
    imageUrl: 'https://example.test/p.png',
    price: toDbMoney(1000),
    currency: 'USD',
    stock: 9,
  } as any);

  await db.insert(inventoryMoves).values({
    moveKey: `reserve:${orderId}:${productId}`,
    orderId,
    productId,
    type: 'reserve',
    quantity: 1,
  } as any);

  return { productId };
}

async function insertOrder(args: {
  orderId: string;
  paymentStatus: 'pending' | 'requires_payment' | 'paid' | 'failed' | 'refunded';
  status: 'INVENTORY_RESERVED' | 'PAID' | 'CANCELED' | 'INVENTORY_FAILED';
  inventoryStatus: 'reserved' | 'released' | 'none';
  stockRestored?: boolean;
  pspChargeId?: string | null;
}) {
  await db.insert(orders).values({
    id: args.orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: args.paymentStatus,
    status: args.status,
    inventoryStatus: args.inventoryStatus,
    stockRestored: args.stockRestored ?? false,
    pspChargeId: args.pspChargeId ?? null,
    idempotencyKey: crypto.randomUUID(),
  } as any);
}

async function insertAttempt(args: {
  orderId: string;
  status: 'creating' | 'active' | 'succeeded' | 'failed' | 'canceled';
  attemptNumber: number;
  invoiceId: string | null;
  metadata?: Record<string, unknown>;
  updatedAt?: Date;
}) {
  await db.insert(paymentAttempts).values({
    id: crypto.randomUUID(),
    orderId: args.orderId,
    provider: 'monobank',
    status: args.status,
    attemptNumber: args.attemptNumber,
    currency: 'UAH',
    expectedAmountMinor: 1000,
    idempotencyKey: crypto.randomUUID(),
    providerPaymentIntentId: args.invoiceId,
    metadata: args.metadata ?? {},
    createdAt: args.updatedAt
      ? new Date(args.updatedAt.getTime() - 1_000)
      : undefined,
    updatedAt: args.updatedAt ?? undefined,
  } as any);
}

async function cleanup(orderId: string) {
  await db
    .delete(monobankPaymentCancels)
    .where(eq(monobankPaymentCancels.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));

  const moves = await db
    .select({ productId: inventoryMoves.productId })
    .from(inventoryMoves)
    .where(eq(inventoryMoves.orderId, orderId));

  await db.delete(inventoryMoves).where(eq(inventoryMoves.orderId, orderId));

  for (const move of moves) {
    await db.delete(products).where(eq(products.id, move.productId));
  }

  await db.delete(orders).where(eq(orders.id, orderId));
}

async function waitForCancelStatus(
  extRef: string,
  status: 'requested' | 'processing' | 'success' | 'failure',
  timeoutMs = 3000
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const [row] = await db
      .select({ status: monobankPaymentCancels.status })
      .from(monobankPaymentCancels)
      .where(eq(monobankPaymentCancels.extRef, extRef))
      .limit(1);

    if (row?.status === status) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for cancel status=${status}`);
}

function makeReq(orderId: string) {
  return new NextRequest(
    `http://localhost/api/shop/admin/orders/${orderId}/cancel-payment`,
    {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    }
  );
}

describe.sequential('monobank cancel payment route (F5)', () => {
  it(
    'happy path unpaid order: PSP once, order canceled, inventory released',
    async () => {
      const orderId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await insertOrder({
        orderId,
        paymentStatus: 'pending',
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        pspChargeId: invoiceId,
      });
      const { productId } = await insertProductWithReservedStock(orderId);

      removeInvoiceMock.mockResolvedValue({
        invoiceId,
        removed: true,
      });

      try {
        const res = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });

        expect(res.status).toBe(200);
        const json: any = await res.json();
        expect(json.success).toBe(true);
        expect(json.cancel.extRef).toBe(`mono_cancel:${orderId}`);
        expect(json.cancel.status).toBe('success');
        expect(json.cancel.deduped).toBe(false);

        expect(removeInvoiceMock).toHaveBeenCalledTimes(1);
        expect(removeInvoiceMock).toHaveBeenCalledWith(invoiceId);

        const [cancelRow] = await db
          .select({
            id: monobankPaymentCancels.id,
            status: monobankPaymentCancels.status,
            extRef: monobankPaymentCancels.extRef,
          })
          .from(monobankPaymentCancels)
          .where(eq(monobankPaymentCancels.orderId, orderId))
          .limit(1);

        expect(cancelRow?.status).toBe('success');
        expect(cancelRow?.extRef).toBe(`mono_cancel:${orderId}`);

        const [orderRow] = await db
          .select({
            status: orders.status,
            inventoryStatus: orders.inventoryStatus,
            paymentStatus: orders.paymentStatus,
            stockRestored: orders.stockRestored,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        expect(orderRow?.status).toBe('CANCELED');
        expect(orderRow?.inventoryStatus).toBe('released');
        expect(orderRow?.paymentStatus).toBe('failed');
        expect(orderRow?.stockRestored).toBe(true);

        const [product] = await db
          .select({ stock: products.stock })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);

        expect(product?.stock).toBe(10);
      } finally {
        await cleanup(orderId);
      }
    },
    15000
  );

  it(
    'idempotency sequential: second call deduped=true, PSP once, one release move',
    async () => {
      const orderId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await insertOrder({
        orderId,
        paymentStatus: 'pending',
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        pspChargeId: invoiceId,
      });
      await insertProductWithReservedStock(orderId);

      removeInvoiceMock.mockResolvedValue({
        invoiceId,
        removed: true,
      });

      try {
        const res1 = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });
        expect(res1.status).toBe(200);

        const res2 = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });
        expect(res2.status).toBe(200);

        const json2: any = await res2.json();
        expect(json2.cancel.deduped).toBe(true);

        expect(removeInvoiceMock).toHaveBeenCalledTimes(1);

        const releaseMoves = await db
          .select({ id: inventoryMoves.id })
          .from(inventoryMoves)
          .where(
            and(
              eq(inventoryMoves.orderId, orderId),
              eq(inventoryMoves.type, 'release')
            )
          );
        expect(releaseMoves).toHaveLength(1);
      } finally {
        await cleanup(orderId);
      }
    },
    15000
  );

  it('paid guard: 409 CANCEL_NOT_ALLOWED, PSP not called', async () => {
    const orderId = crypto.randomUUID();

    await insertOrder({
      orderId,
      paymentStatus: 'paid',
      status: 'PAID',
      inventoryStatus: 'released',
      stockRestored: true,
      pspChargeId: `inv_${crypto.randomUUID()}`,
    });

    try {
      const res = await postRoute(makeReq(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(409);

      const json: any = await res.json();
      expect(json.code).toBe('CANCEL_NOT_ALLOWED');
      expect(removeInvoiceMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orderId);
    }
  });

  it(
    'PSP failure then retry: first 503+failure, second 200 success',
    async () => {
      const orderId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await insertOrder({
        orderId,
        paymentStatus: 'pending',
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        pspChargeId: invoiceId,
      });
      await insertProductWithReservedStock(orderId);

      removeInvoiceMock
        .mockRejectedValueOnce(new Error('psp down'))
        .mockResolvedValueOnce({ invoiceId, removed: true });

      try {
        const res1 = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });
        expect(res1.status).toBe(503);
        const json1: any = await res1.json();
        expect(json1.code).toBe('PSP_UNAVAILABLE');

        const [rowAfterFail] = await db
          .select({
            status: monobankPaymentCancels.status,
          })
          .from(monobankPaymentCancels)
          .where(eq(monobankPaymentCancels.orderId, orderId))
          .limit(1);
        expect(rowAfterFail?.status).toBe('failure');

        const [orderAfterFail] = await db
          .select({
            status: orders.status,
            inventoryStatus: orders.inventoryStatus,
            stockRestored: orders.stockRestored,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);
        expect(orderAfterFail?.status).toBe('INVENTORY_RESERVED');
        expect(orderAfterFail?.inventoryStatus).toBe('reserved');
        expect(orderAfterFail?.stockRestored).toBe(false);

        const res2 = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });
        expect(res2.status).toBe(200);
        const json2: any = await res2.json();
        expect(json2.cancel.status).toBe('success');
        expect(json2.cancel.deduped).toBe(false);

        expect(removeInvoiceMock).toHaveBeenCalledTimes(2);
      } finally {
        await cleanup(orderId);
      }
    },
    15000
  );

  it('service gate disabled: 409 CANCEL_DISABLED, PSP not called', async () => {
    const orderId = crypto.randomUUID();

    await insertOrder({
      orderId,
      paymentStatus: 'pending',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      pspChargeId: `inv_${crypto.randomUUID()}`,
    });
    await insertProductWithReservedStock(orderId);

    process.env.PAYMENTS_ENABLED = 'false';
    resetEnvCache();

    try {
      const res = await postRoute(makeReq(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('CANCEL_DISABLED');
      expect(removeInvoiceMock).not.toHaveBeenCalled();
    } finally {
      process.env.PAYMENTS_ENABLED = 'true';
      resetEnvCache();
      await cleanup(orderId);
    }
  });

  it('invoice selection prefers succeeded attempt over newer failed attempt', async () => {
    const orderId = crypto.randomUUID();
    const goodInvoice = `inv_good_${crypto.randomUUID()}`;
    const badInvoice = `inv_bad_${crypto.randomUUID()}`;
    const now = Date.now();

    await insertOrder({
      orderId,
      paymentStatus: 'pending',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      pspChargeId: null,
    });
    await insertProductWithReservedStock(orderId);

    await insertAttempt({
      orderId,
      status: 'succeeded',
      attemptNumber: 1,
      invoiceId: goodInvoice,
      updatedAt: new Date(now - 60_000),
    });

    await insertAttempt({
      orderId,
      status: 'failed',
      attemptNumber: 2,
      invoiceId: badInvoice,
      updatedAt: new Date(now),
    });

    removeInvoiceMock.mockResolvedValue({
      invoiceId: goodInvoice,
      removed: true,
    });

    try {
      const res = await postRoute(makeReq(orderId), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(res.status).toBe(200);

      expect(removeInvoiceMock).toHaveBeenCalledTimes(1);
      expect(removeInvoiceMock).toHaveBeenCalledWith(goodInvoice);
    } finally {
      await cleanup(orderId);
    }
  });

  it(
    'concurrency: two parallel POSTs perform single PSP call',
    async () => {
      const orderId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await insertOrder({
        orderId,
        paymentStatus: 'pending',
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        pspChargeId: invoiceId,
      });
      await insertProductWithReservedStock(orderId);

      removeInvoiceMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { invoiceId, removed: true };
      });

      try {
        const [res1, res2] = await Promise.all([
          postRoute(makeReq(orderId), { params: Promise.resolve({ id: orderId }) }),
          postRoute(makeReq(orderId), { params: Promise.resolve({ id: orderId }) }),
        ]);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        const json1: any = await res1.json();
        const json2: any = await res2.json();

        expect(removeInvoiceMock).toHaveBeenCalledTimes(1);

        const dedupedValues = [json1.cancel.deduped, json2.cancel.deduped].sort();
        expect(dedupedValues).toEqual([false, true]);

        const releaseMoves = await db
          .select({ id: inventoryMoves.id })
          .from(inventoryMoves)
          .where(
            and(
              eq(inventoryMoves.orderId, orderId),
              eq(inventoryMoves.type, 'release')
            )
          );
        expect(releaseMoves).toHaveLength(1);

        const [cancelRow] = await db
          .select({ status: monobankPaymentCancels.status })
          .from(monobankPaymentCancels)
          .where(eq(monobankPaymentCancels.orderId, orderId))
          .limit(1);
        expect(cancelRow?.status).toBe('success');
      } finally {
        await cleanup(orderId);
      }
    },
    20000
  );

  it(
    'follower in requested state returns 409 CANCEL_IN_PROGRESS while leader is in-flight',
    async () => {
      const orderId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await insertOrder({
        orderId,
        paymentStatus: 'pending',
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        pspChargeId: invoiceId,
      });
      await insertProductWithReservedStock(orderId);

      removeInvoiceMock.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { invoiceId, removed: true };
      });

      const leaderPromise = postRoute(makeReq(orderId), {
        params: Promise.resolve({ id: orderId }),
      });

      try {
        await waitForCancelStatus(`mono_cancel:${orderId}`, 'requested');

        const followerRes = await postRoute(makeReq(orderId), {
          params: Promise.resolve({ id: orderId }),
        });

        expect(followerRes.status).toBe(409);
        const followerJson: any = await followerRes.json();
        expect(followerJson.code).toBe('CANCEL_IN_PROGRESS');

        const leaderRes = await leaderPromise;
        expect(leaderRes.status).toBe(200);

        expect(removeInvoiceMock).toHaveBeenCalledTimes(1);
      } finally {
        await cleanup(orderId);
      }
    },
    15000
  );
});

