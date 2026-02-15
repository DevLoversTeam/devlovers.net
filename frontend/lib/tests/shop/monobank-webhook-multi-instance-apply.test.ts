import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
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

const sha256HexUtf8 = (s: string) =>
  crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

async function insertOrderAndAttempt(args: {
  invoiceId: string;
  amountMinor: number;
}) {
  const orderId = crypto.randomUUID();
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

  const attemptId = crypto.randomUUID();
  await db.insert(paymentAttempts).values({
    id: attemptId,
    orderId,
    provider: 'monobank',
    status: 'active',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: args.amountMinor,
    idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
    providerPaymentIntentId: args.invoiceId,
  } as any);

  return { orderId, attemptId };
}

async function insertPersistedEvent(args: {
  invoiceId: string;
  attemptId: string;
  orderId: string;
  rawSha256: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(monobankEvents).values({
    provider: 'monobank',
    eventKey: args.rawSha256,
    invoiceId: args.invoiceId,
    status: String(args.payload.status ?? 'success'),
    amount:
      typeof args.payload.amount === 'number'
        ? Math.trunc(args.payload.amount)
        : null,
    ccy:
      typeof args.payload.ccy === 'number'
        ? Math.trunc(args.payload.ccy)
        : null,
    reference:
      typeof args.payload.reference === 'string'
        ? args.payload.reference
        : null,
    rawPayload: args.payload,
    normalizedPayload: args.payload,
    attemptId: args.attemptId,
    orderId: args.orderId,
    rawSha256: args.rawSha256,
  } as any);
}

async function cleanup(orderId: string, invoiceId: string) {
  await db
    .delete(monobankEvents)
    .where(eq(monobankEvents.invoiceId, invoiceId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank webhook multi-instance apply', () => {
  beforeAll(() => {
    assertNotProductionDb();
  });

  it('persisted event + parallel apply -> exactly one apply and no double side effects', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId, attemptId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const payload = {
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      reference: attemptId,
    };
    const rawBody = JSON.stringify(payload);
    const rawSha256 = sha256HexUtf8(rawBody);

    await insertPersistedEvent({
      invoiceId,
      attemptId,
      orderId,
      rawSha256,
      payload,
    });

    try {
      const [first, second] = await Promise.all([
        applyMonoWebhookEvent({
          rawBody,
          parsedPayload: payload,
          rawSha256,
          eventKey: rawSha256,
          requestId: 'multi-instance-1',
          mode: 'apply',
        }),
        applyMonoWebhookEvent({
          rawBody,
          parsedPayload: payload,
          rawSha256,
          eventKey: rawSha256,
          requestId: 'multi-instance-2',
          mode: 'apply',
        }),
      ]);

      const outcomes = [first, second].map(x => x.appliedResult);
      const appliedCount = outcomes.filter(x => x === 'applied').length;
      expect(appliedCount).toBe(1);
      expect(outcomes.some(x => x === 'deduped' || x === 'applied_noop')).toBe(
        true
      );

      const [orderRow] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.paymentStatus).toBe('paid');

      const [attemptRow] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attemptRow?.status).toBe('succeeded');

      const [eventRow] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedAt: monobankEvents.appliedAt,
          claimExpiresAt: monobankEvents.claimExpiresAt,
          claimedBy: monobankEvents.claimedBy,
        })
        .from(monobankEvents)
        .where(
          and(
            eq(monobankEvents.invoiceId, invoiceId),
            eq(monobankEvents.rawSha256, rawSha256)
          )
        )
        .limit(1);

      expect(eventRow?.appliedResult).toBe('applied');
      expect(eventRow?.appliedAt).toBeTruthy();
      expect(eventRow?.claimExpiresAt).toBeTruthy();
      expect(eventRow?.claimedBy).toBeTruthy();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });
});
