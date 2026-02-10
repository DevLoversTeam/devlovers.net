import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import { PspInvoicePersistError } from '@/lib/services/errors';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { __test__ } from '@/lib/services/orders/monobank';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/services/orders/restock', () => ({
  restockOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/psp/monobank', async () => {
  const actual = await vi.importActual<any>('@/lib/psp/monobank');
  return {
    ...actual,
    cancelMonobankInvoice: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function cleanup(orderId: string) {
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank finalizeAttemptWithInvoice fallback', () => {
  it('rejects with PspInvoicePersistError, but persists payment_attempt and cancels invoice (fallback)', async () => {
    const orderId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const pageUrl = `https://pay.example.test/${crypto.randomUUID()}`;

    await db.insert(orders).values({
      id: orderId,
      totalAmountMinor: 1000,
      totalAmount: toDbMoney(1000),
      currency: 'UAH',
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      idempotencyKey: crypto.randomUUID(),
      pspMetadata: {},
    } as any);

    await db.insert(paymentAttempts).values({
      id: attemptId,
      orderId,
      provider: 'monobank',
      status: 'creating',
      attemptNumber: 1,
      currency: 'UAH',
      expectedAmountMinor: 1000,
      idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
      metadata: {},
    } as any);

    const originalUpdate = (db as any).update.bind(db);
    const spy = vi
      .spyOn(db as any, 'update')
      .mockImplementation((table: any) => {
        if (table === orders) {
          throw new Error('forced_orders_update_fail');
        }
        return originalUpdate(table);
      });

    try {
      await expect(
        __test__.finalizeAttemptWithInvoice({
          attemptId,
          orderId,
          invoiceId,
          pageUrl,
          requestId: 'req_finalize_fallback',
        })
      ).rejects.toBeInstanceOf(PspInvoicePersistError);

      const [attempt] = await db
        .select({
          providerPaymentIntentId: paymentAttempts.providerPaymentIntentId,
          metadata: paymentAttempts.metadata,
          status: paymentAttempts.status,
          lastErrorCode: paymentAttempts.lastErrorCode,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);

      expect(attempt?.providerPaymentIntentId).toBe(invoiceId);
      const meta = (attempt?.metadata ?? {}) as Record<string, unknown>;
      expect(meta.invoiceId).toBe(invoiceId);
      expect(meta.pageUrl).toBe(pageUrl);
      expect(attempt?.status).toBe('failed');
      expect(attempt?.lastErrorCode).toBe('PSP_INVOICE_PERSIST_FAILED');

      const { cancelMonobankInvoice } = await import('@/lib/psp/monobank');
      expect(cancelMonobankInvoice).toHaveBeenCalledTimes(1);
      expect(cancelMonobankInvoice).toHaveBeenCalledWith(invoiceId);
    } finally {
      spy.mockRestore();
      await cleanup(orderId);
    }
  }, 15000);
});
