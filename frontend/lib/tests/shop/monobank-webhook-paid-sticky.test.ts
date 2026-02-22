import crypto from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { applyMonoWebhookEvent } from '@/lib/services/orders/monobank-webhook';
import { toDbMoney } from '@/lib/shop/money';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

vi.mock('@/lib/services/orders/restock', () => ({
  restockOrder: vi.fn().mockResolvedValue(undefined),
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

function sha256HexUtf8(value: string) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(value, 'utf8'))
    .digest('hex');
}

async function insertOrderAndAttempt(args: {
  invoiceId: string;
  amountMinor: number;
}) {
  const orderId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: args.amountMinor,
    totalAmount: toDbMoney(args.amountMinor),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: crypto.randomUUID(),
  } as any);

  await db.insert(paymentAttempts).values({
    id: attemptId,
    orderId,
    provider: 'monobank',
    status: 'active',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: args.amountMinor,
    idempotencyKey: `test:${attemptId}`,
    providerPaymentIntentId: args.invoiceId,
    providerModifiedAt: null,
  } as any);

  return { orderId, attemptId };
}

async function cleanup(args: {
  orderId: string;
  attemptId: string;
  successRawSha256: string;
  processingRawSha256: string;
}) {
  await db
    .delete(monobankEvents)
    .where(
      inArray(monobankEvents.rawSha256, [
        args.successRawSha256,
        args.processingRawSha256,
      ])
    );
  await db
    .delete(paymentAttempts)
    .where(eq(paymentAttempts.id, args.attemptId));
  await db.delete(orders).where(eq(orders.id, args.orderId));
}

describe.sequential('monobank webhook paid-sticky', () => {
  assertNotProductionDb();

  it('keeps paid+succeeded when an older processing event arrives after success', async () => {
    const invoiceId = `tst_inv_${crypto.randomUUID()}`;
    const { orderId, attemptId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const now = Date.now();
    const successPayload = {
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      reference: attemptId,
      modifiedAt: new Date(now).toISOString(),
    };
    const olderProcessingPayload = {
      invoiceId,
      status: 'processing',
      amount: 1000,
      ccy: 980,
      reference: attemptId,
      modifiedAt: new Date(now - 60_000).toISOString(),
    };

    const successBody = JSON.stringify(successPayload);
    const successRawSha256 = sha256HexUtf8(successBody);
    const processingBody = JSON.stringify(olderProcessingPayload);
    const processingRawSha256 = sha256HexUtf8(processingBody);

    try {
      const first = await applyMonoWebhookEvent({
        rawBody: successBody,
        parsedPayload: successPayload,
        rawSha256: successRawSha256,
        eventKey: successRawSha256,
        requestId: 'paid-sticky-success',
        mode: 'apply',
      });
      expect(first.appliedResult).toBe('applied');

      const [stateAfterSuccess] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          attemptStatus: paymentAttempts.status,
        })
        .from(orders)
        .innerJoin(paymentAttempts, eq(paymentAttempts.orderId, orders.id))
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(stateAfterSuccess?.paymentStatus).toBe('paid');
      expect(stateAfterSuccess?.attemptStatus).toBe('succeeded');

      const second = await applyMonoWebhookEvent({
        rawBody: processingBody,
        parsedPayload: olderProcessingPayload,
        rawSha256: processingRawSha256,
        eventKey: processingRawSha256,
        requestId: 'paid-sticky-older-processing',
        mode: 'apply',
      });
      expect(second.appliedResult).toBe('applied_noop');

      const [stateAfterOlder] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          attemptStatus: paymentAttempts.status,
        })
        .from(orders)
        .innerJoin(paymentAttempts, eq(paymentAttempts.orderId, orders.id))
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(stateAfterOlder?.paymentStatus).toBe('paid');
      expect(stateAfterOlder?.attemptStatus).toBe('succeeded');

      const [olderEvent] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedErrorCode: monobankEvents.appliedErrorCode,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.rawSha256, processingRawSha256))
        .limit(1);

      expect(olderEvent?.appliedResult).toBe('applied_noop');
      expect(olderEvent?.appliedErrorCode).toBe('OUT_OF_ORDER');
    } finally {
      await cleanup({
        orderId,
        attemptId,
        successRawSha256,
        processingRawSha256,
      });
    }
  });
});
