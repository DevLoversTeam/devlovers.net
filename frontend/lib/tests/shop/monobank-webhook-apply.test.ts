import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts, shippingShipments } from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { applyMonoWebhookEvent } from '@/lib/services/orders/monobank-webhook';
import { toDbMoney } from '@/lib/shop/money';

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

beforeEach(() => {
  vi.clearAllMocks();
});

const sha256HexUtf8 = (s: string) =>
  crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

async function insertOrderAndAttempt(args: {
  invoiceId: string;
  amountMinor: number;
  inventoryStatus?:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  withShippingNp?: boolean;
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
    inventoryStatus: args.inventoryStatus ?? 'reserved',
    ...(args.withShippingNp
      ? {
          shippingRequired: true,
          shippingPayer: 'customer',
          shippingProvider: 'nova_poshta',
          shippingMethodCode: 'NP_WAREHOUSE',
          shippingAmountMinor: null,
          shippingStatus: 'pending',
        }
      : {}),
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

async function cleanup(orderId: string, invoiceId: string) {
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db
    .delete(monobankEvents)
    .where(eq(monobankEvents.invoiceId, invoiceId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('monobank webhook apply (persist-first)', () => {
  it('out-of-order: expired -> success becomes needs_review (not paid)', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });
    const expiredBody = JSON.stringify({
      invoiceId,
      status: 'expired',
      amount: 1000,
      ccy: 980,
    });
    const successBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });

    try {
      await applyMonoWebhookEvent({
        rawBody: expiredBody,
        rawSha256: sha256HexUtf8(expiredBody),
        requestId: 'req_ooo_1',
        mode: 'apply',
      });

      const second = await applyMonoWebhookEvent({
        rawBody: successBody,
        rawSha256: sha256HexUtf8(successBody),
        requestId: 'req_ooo_2',
        mode: 'apply',
      });

      expect(second.appliedResult).toBe('applied_with_issue');

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('needs_review');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  }, 15000);
  it('dedupes identical events and applies once', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
      withShippingNp: true,
      inventoryStatus: 'reserved',
    });

    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });

    try {
      const first = await applyMonoWebhookEvent({
        rawBody,
        rawSha256: sha256HexUtf8(rawBody),
        requestId: 'req_dedupe_1',
        mode: 'apply',
      });
      const second = await applyMonoWebhookEvent({
        rawBody,
        rawSha256: sha256HexUtf8(rawBody),
        requestId: 'req_dedupe_2',
        mode: 'apply',
      });

      expect(first.deduped).toBe(false);
      expect(second.deduped).toBe(true);

      const events = await db
        .select({ id: monobankEvents.id })
        .from(monobankEvents)
        .where(eq(monobankEvents.invoiceId, invoiceId));
      expect(events.length).toBe(1);

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.shippingStatus).toBe('queued');

      const queued = await db
        .select({
          id: shippingShipments.id,
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(queued.length).toBe(1);
      expect(queued[0]?.status).toBe('queued');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('does not enqueue shipment when inventory is not committed', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
      withShippingNp: true,
      inventoryStatus: 'reserving',
    });

    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });

    try {
      const first = await applyMonoWebhookEvent({
        rawBody,
        rawSha256: sha256HexUtf8(rawBody),
        requestId: 'req_ineligible_inv_1',
        mode: 'apply',
      });

      expect(first.appliedResult).toBe('applied');

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.shippingStatus).toBe('pending');

      const queued = await db
        .select({ id: shippingShipments.id })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(queued.length).toBe(0);
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('claim/lease allows only one apply when called concurrently', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });

    try {
      const [first, second] = await Promise.all([
        applyMonoWebhookEvent({
          rawBody,
          rawSha256: sha256HexUtf8(rawBody),
          requestId: 'req_claim_1',
          mode: 'apply',
        }),
        applyMonoWebhookEvent({
          rawBody,
          rawSha256: sha256HexUtf8(rawBody),
          requestId: 'req_claim_2',
          mode: 'apply',
        }),
      ]);

      const appliedCount = [first, second].filter(
        res => res.appliedResult === 'applied'
      ).length;
      expect(appliedCount).toBe(1);

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');

      const [event] = await db
        .select({
          claimedAt: monobankEvents.claimedAt,
          claimExpiresAt: monobankEvents.claimExpiresAt,
          claimedBy: monobankEvents.claimedBy,
          appliedAt: monobankEvents.appliedAt,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.invoiceId, invoiceId))
        .limit(1);
      expect(event?.claimedAt).toBeTruthy();
      expect(event?.claimExpiresAt).toBeTruthy();
      expect(event?.claimedBy).toBeTruthy();
      expect(event?.appliedAt).toBeTruthy();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('paid does not block: later expired event is applied_with_issue (transition blocked)', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const paidBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });
    const failedBody = JSON.stringify({
      invoiceId,
      status: 'expired',
      amount: 1000,
      ccy: 980,
    });

    try {
      await applyMonoWebhookEvent({
        rawBody: paidBody,
        rawSha256: sha256HexUtf8(paidBody),
        requestId: 'req_paid',
        mode: 'apply',
      });

      const second = await applyMonoWebhookEvent({
        rawBody: failedBody,
        rawSha256: sha256HexUtf8(failedBody),
        requestId: 'req_failed',
        mode: 'apply',
      });

      expect(second.appliedResult).toBe('applied_with_issue');

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');

      const [event] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedErrorCode: monobankEvents.appliedErrorCode,
        })
        .from(monobankEvents)
        .where(
          and(
            eq(monobankEvents.invoiceId, invoiceId),
            eq(monobankEvents.status, 'expired')
          )
        )
        .limit(1);
      expect(event?.appliedResult).toBe('applied_with_issue');
      expect(event?.appliedErrorCode).toBe('PAYMENT_STATE_BLOCKED');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('providerModifiedAt ordering ignores older success events', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const now = Date.now();
    const paidBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      modifiedDate: now,
    });
    const olderSuccessBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      modifiedDate: now - 60_000,
    });

    try {
      await applyMonoWebhookEvent({
        rawBody: paidBody,
        rawSha256: sha256HexUtf8(paidBody),
        requestId: 'req_paid_ordering',
        mode: 'apply',
      });

      const second = await applyMonoWebhookEvent({
        rawBody: olderSuccessBody,
        rawSha256: sha256HexUtf8(olderSuccessBody),
        requestId: 'req_old_success',
        mode: 'apply',
      });

      expect(second.appliedResult).toBe('applied_noop');

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');

      const [event] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedErrorCode: monobankEvents.appliedErrorCode,
        })
        .from(monobankEvents)
        .where(
          and(
            eq(monobankEvents.invoiceId, invoiceId),
            eq(monobankEvents.appliedResult, 'applied_noop')
          )
        )
        .limit(1);
      expect(event?.appliedErrorCode).toBe('OUT_OF_ORDER');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('mismatch marks applied_with_issue and fails the attempt', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
    });

    const mismatchBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 900,
      ccy: 980,
    });

    try {
      const res = await applyMonoWebhookEvent({
        rawBody: mismatchBody,
        requestId: 'req_mismatch',
        rawSha256: sha256HexUtf8(mismatchBody),
        mode: 'apply',
      });

      expect(res.appliedResult).toBe('applied_with_issue');

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          lastErrorCode: paymentAttempts.lastErrorCode,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);
      expect(attempt?.status).toBe('failed');
      expect(attempt?.lastErrorCode).toBe('AMOUNT_MISMATCH');

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          failureCode: orders.failureCode,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('needs_review');
      expect(order?.failureCode).toBe('MONO_AMOUNT_MISMATCH');

      const [event] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedErrorCode: monobankEvents.appliedErrorCode,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.invoiceId, invoiceId))
        .limit(1);
      expect(event?.appliedResult).toBe('applied_with_issue');
      expect(event?.appliedErrorCode).toBe('AMOUNT_MISMATCH');

      const { restockOrder } = await import('@/lib/services/orders/restock');
      expect(restockOrder).not.toHaveBeenCalled();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });
});
