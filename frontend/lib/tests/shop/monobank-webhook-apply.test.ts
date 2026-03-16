import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  monobankEvents,
  orders,
  paymentAttempts,
  paymentEvents,
  shippingShipments,
} from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { applyMonoWebhookEvent } from '@/lib/services/orders/monobank-webhook';
import { restockOrder } from '@/lib/services/orders/restock';
import { closeShippingPipelineForOrder } from '@/lib/services/shop/shipping/pipeline-shutdown';
import { claimQueuedShipmentsForProcessing } from '@/lib/services/shop/shipping/shipments-worker';
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

  restockOrderMock.mockImplementation(async (orderId: string) => {
    await closeShippingPipelineForOrder({
      orderId,
      reason: 'test_restock',
    });

    await db
      .update(orders)
      .set({
        stockRestored: true,
        restockedAt: new Date(),
        inventoryStatus: 'released',
        updatedAt: new Date(),
      } as any)
      .where(eq(orders.id, orderId));
  });
});

const restockOrderMock = vi.mocked(restockOrder);

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
  seedQueuedShipment?: boolean;
  attemptMetadata?: Record<string, unknown>;
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
          shippingStatus: args.seedQueuedShipment ? 'queued' : 'pending',
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
    metadata: args.attemptMetadata ?? {},
  } as any);

  if (args.withShippingNp && args.seedQueuedShipment) {
    await db.insert(shippingShipments).values({
      id: crypto.randomUUID(),
      orderId,
      provider: 'nova_poshta',
      status: 'queued',
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    } as any);
  }

  return { orderId, attemptId };
}

async function cleanup(orderId: string, invoiceId: string) {
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  try {
    await db.delete(paymentEvents).where(eq(paymentEvents.orderId, orderId));
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    // 42P01 = undefined_table (migration not applied in local DB yet).
    if (code !== '42P01') throw error;
  }
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
  it('dedupes identical events, applies once, and writes canonical payment event', async () => {
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
      const canonical = await db
        .select({
          id: paymentEvents.id,
          eventName: paymentEvents.eventName,
          eventRef: paymentEvents.eventRef,
        })
        .from(paymentEvents)
        .where(eq(paymentEvents.orderId, orderId));
      expect(canonical.length).toBe(1);
      expect(canonical[0]?.eventName).toBe('paid_applied');
      expect(canonical[0]?.eventRef).toBe(events[0]?.id ?? null);

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

  it('copies wallet attribution from attempt metadata and performs no outbound network calls', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
      attemptMetadata: {
        monobank: {
          wallet: {
            requested: 'google_pay',
          },
        },
      },
    });

    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const res = await applyMonoWebhookEvent({
        rawBody,
        rawSha256: sha256HexUtf8(rawBody),
        requestId: 'req_wallet_attr_1',
        mode: 'apply',
      });

      expect(res.appliedResult).toBe('applied');

      const [order] = await db
        .select({ pspMetadata: orders.pspMetadata })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect((order?.pspMetadata as any)?.wallet).toEqual({
        provider: 'monobank',
        type: 'google_pay',
        source: 'attempt',
      });

      const [event] = await db
        .select({ payload: paymentEvents.payload })
        .from(paymentEvents)
        .where(eq(paymentEvents.orderId, orderId))
        .limit(1);

      expect((event?.payload as any)?.wallet).toEqual({
        provider: 'monobank',
        type: 'google_pay',
        source: 'attempt',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
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

  it('reversed closes queued shipment pipeline and is idempotent on rerun', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
      withShippingNp: true,
      inventoryStatus: 'reserved',
    });

    const successBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
    });
    const reversedBody = JSON.stringify({
      invoiceId,
      status: 'reversed',
      amount: 1000,
      ccy: 980,
    });

    try {
      const paid = await applyMonoWebhookEvent({
        rawBody: successBody,
        rawSha256: sha256HexUtf8(successBody),
        requestId: 'req_paid_before_reverse',
        mode: 'apply',
      });
      expect(paid.appliedResult).toBe('applied');

      const reversed = await applyMonoWebhookEvent({
        rawBody: reversedBody,
        rawSha256: sha256HexUtf8(reversedBody),
        requestId: 'req_reversed_1',
        mode: 'apply',
      });
      expect(reversed.appliedResult).toBe('applied');

      const [orderAfterReverse] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderAfterReverse?.paymentStatus).toBe('refunded');
      expect(orderAfterReverse?.shippingStatus).toBe('cancelled');

      const queuedRows = await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(queuedRows.length).toBeGreaterThan(0);
      expect(queuedRows.every(row => row.status === 'needs_attention')).toBe(
        true
      );

      const claimed = await claimQueuedShipmentsForProcessing({
        runId: crypto.randomUUID(),
        leaseSeconds: 120,
        limit: 10,
      });
      expect(claimed).toHaveLength(0);

      const rerun = await applyMonoWebhookEvent({
        rawBody: reversedBody,
        rawSha256: sha256HexUtf8(reversedBody),
        requestId: 'req_reversed_2',
        mode: 'apply',
      });
      expect(rerun.deduped).toBe(true);

      const afterRerunRows = await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(
        afterRerunRows.every(row => row.status === 'needs_attention')
      ).toBe(true);
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('failure on non-paid order does not leave processable shipping pipeline and is idempotent on rerun', async () => {
    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt({
      invoiceId,
      amountMinor: 1000,
      withShippingNp: true,
      inventoryStatus: 'reserved',
    });

    const failureBody = JSON.stringify({
      invoiceId,
      status: 'failure',
      amount: 1000,
      ccy: 980,
    });

    try {
      const failed = await applyMonoWebhookEvent({
        rawBody: failureBody,
        rawSha256: sha256HexUtf8(failureBody),
        requestId: 'req_failure_1',
        mode: 'apply',
      });
      expect(failed.appliedResult).toBe('applied');

      const [orderAfterFailure] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderAfterFailure?.paymentStatus).toBe('failed');
      expect(orderAfterFailure?.shippingStatus).toBe('cancelled');

      const shipmentRows = await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(shipmentRows).toHaveLength(0);

      const claimed = await claimQueuedShipmentsForProcessing({
        runId: crypto.randomUUID(),
        leaseSeconds: 120,
        limit: 10,
      });
      expect(claimed).toHaveLength(0);

      const rerun = await applyMonoWebhookEvent({
        rawBody: failureBody,
        rawSha256: sha256HexUtf8(failureBody),
        requestId: 'req_failure_2',
        mode: 'apply',
      });
      expect(rerun.deduped).toBe(true);

      const afterRerunRows = await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId));
      expect(afterRerunRows).toHaveLength(0);
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

      expect(restockOrderMock).not.toHaveBeenCalled();
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });
});
