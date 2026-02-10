import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/services/orders/restock', () => ({
  restockOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/orders/payment-state', () => ({
  guardedPaymentStatusUpdate: vi.fn().mockResolvedValue({
    applied: true,
    currentProvider: 'monobank',
    from: 'paid',
    reason: null,
  }),
}));

vi.mock('@/lib/logging', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

async function cleanup(
  orderId: string,
  attemptId: string,
  eventId: string | null
) {
  if (eventId) {
    await db.delete(monobankEvents).where(eq(monobankEvents.id, eventId));
  }
  await db.delete(paymentAttempts).where(eq(paymentAttempts.id, attemptId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential(
  'monobank webhook: paid must not block reversed/failure/expired',
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('paid + reversed reaches reversal handler (attempt canceled, restock called, status transition invoked)', async () => {
      const { applyMonoWebhookEvent } =
        await import('@/lib/services/orders/monobank-webhook');
      const { restockOrder } = await import('@/lib/services/orders/restock');
      const { guardedPaymentStatusUpdate } =
        await import('@/lib/services/orders/payment-state');

      const orderId = crypto.randomUUID();
      const attemptId = crypto.randomUUID();
      const invoiceId = `inv_${crypto.randomUUID()}`;

      await db.insert(orders).values({
        id: orderId,
        totalAmountMinor: 1000,
        totalAmount: toDbMoney(1000),
        currency: 'UAH',
        paymentProvider: 'monobank',
        paymentStatus: 'paid',
        status: 'PAID',
        inventoryStatus: 'reserved',
        idempotencyKey: crypto.randomUUID(),
        pspMetadata: {},
        pspChargeId: invoiceId,
      } as any);

      await db.insert(paymentAttempts).values({
        id: attemptId,
        orderId,
        provider: 'monobank',
        status: 'succeeded',
        attemptNumber: 1,
        currency: 'UAH',
        expectedAmountMinor: 1000,
        idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
        providerPaymentIntentId: invoiceId,
        metadata: {},
      } as any);

      const payload = {
        invoiceId,
        status: 'reversed',
        amount: 1000,
        ccy: 980,
        reference: attemptId,
        modifiedAt: Date.now(),
      };

      const rawBody = JSON.stringify(payload);
      const rawSha256 = crypto
        .createHash('sha256')
        .update(rawBody)
        .digest('hex');

      let eventId: string | null = null;

      try {
        const res = await applyMonoWebhookEvent({
          rawBody,
          requestId: 'req_paid_reversed',
          mode: 'apply',
          rawSha256,
          parsedPayload: payload,
          eventKey: rawSha256,
        });

        eventId = res.eventId;

        expect(res.appliedResult).toBe('applied');

        const [attempt] = await db
          .select({
            status: paymentAttempts.status,
            lastErrorCode: paymentAttempts.lastErrorCode,
          })
          .from(paymentAttempts)
          .where(eq(paymentAttempts.id, attemptId))
          .limit(1);

        expect(attempt?.status).toBe('canceled');
        expect(attempt?.lastErrorCode).toBe('reversed');

        expect(guardedPaymentStatusUpdate).toHaveBeenCalledTimes(1);
        expect(guardedPaymentStatusUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId,
            paymentProvider: 'monobank',
            to: 'refunded',
            source: 'monobank_webhook',
          })
        );

        expect(restockOrder).toHaveBeenCalledTimes(1);
        expect(restockOrder).toHaveBeenCalledWith(orderId, {
          reason: 'refunded',
          workerId: 'monobank_webhook',
        });
      } finally {
        await cleanup(orderId, attemptId, eventId);
      }
    }, 20000);
  }
);
