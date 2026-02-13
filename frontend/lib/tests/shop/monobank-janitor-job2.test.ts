import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { runMonobankJanitorJob2 } from '@/lib/services/orders/monobank-janitor';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logInfo: () => {},
    logWarn: () => {},
    logError: () => {},
  };
});

async function insertOrderAndAttempt(args: {
  createdAt: Date;
  paymentStatus?: 'pending' | 'requires_payment' | 'paid';
  orderStatus?: 'INVENTORY_RESERVED' | 'PAID' | 'CREATED';
}) {
  const orderId = crypto.randomUUID();
  const attemptId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: args.paymentStatus ?? 'pending',
    status: args.orderStatus ?? 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: crypto.randomUUID(),
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
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
    providerPaymentIntentId: null,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  } as any);

  return { orderId, attemptId };
}

async function cleanup(orderId: string) {
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeArgs(
  override?: Partial<Parameters<typeof runMonobankJanitorJob2>[0]>
) {
  return {
    dryRun: false,
    limit: 20,
    requestId: `req-${crypto.randomUUID()}`,
    runId: crypto.randomUUID(),
    baseMeta: {
      route: '/api/shop/internal/monobank/janitor',
      method: 'POST',
      jobName: 'monobank-janitor',
    },
    ...override,
  };
}

describe.sequential('monobank janitor job2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MONO_JANITOR_JOB2_TTL_SECONDS', '120');
    vi.stubEnv('MONO_JANITOR_LEASE_SECONDS', '120');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('stale creating attempt without invoice id -> fail + cancel + restock once', async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      createdAt: staleAt,
    });

    try {
      const res = await runMonobankJanitorJob2(makeArgs());
      expect(res).toEqual({
        processed: 1,
        applied: 1,
        noop: 0,
        failed: 0,
      });

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          lastErrorCode: paymentAttempts.lastErrorCode,
          lastErrorMessage: paymentAttempts.lastErrorMessage,
          finalizedAt: paymentAttempts.finalizedAt,
          janitorClaimedUntil: paymentAttempts.janitorClaimedUntil,
          janitorClaimedBy: paymentAttempts.janitorClaimedBy,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('failed');
      expect(attempt?.lastErrorCode).toBe('invoice_missing');
      expect(attempt?.lastErrorMessage).toBe(
        'Active attempt missing invoice details (stale).'
      );
      expect(attempt?.finalizedAt).toBeTruthy();
      expect(attempt?.janitorClaimedUntil).toBeNull();
      expect(attempt?.janitorClaimedBy).toBeNull();

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          failureCode: orders.failureCode,
          failureMessage: orders.failureMessage,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('failed');
      expect(order?.status).toBe('CANCELED');
      expect(order?.inventoryStatus).toBe('released');
      expect(order?.stockRestored).toBe(true);
      expect(order?.restockedAt).toBeTruthy();
      expect(order?.failureCode).toBe('PSP_UNAVAILABLE');
      expect(order?.failureMessage).toBe('Monobank invoice create failed.');
    } finally {
      await cleanup(orderId);
    }
  });

  it('rerun is idempotent and does not call restock twice', async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      createdAt: staleAt,
    });

    try {
      const first = await runMonobankJanitorJob2(makeArgs());
      expect(first).toEqual({
        processed: 1,
        applied: 1,
        noop: 0,
        failed: 0,
      });

      const second = await runMonobankJanitorJob2(makeArgs());
      expect(second).toEqual({
        processed: 0,
        applied: 0,
        noop: 0,
        failed: 0,
      });

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('failed');
      expect(order?.status).toBe('CANCELED');
      expect(order?.inventoryStatus).toBe('released');
      expect(order?.stockRestored).toBe(true);
      expect(order?.restockedAt).toBeTruthy();

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('failed');
    } finally {
      await cleanup(orderId);
    }
  });

  it('dryRun counts eligible rows without claiming or mutating', async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      createdAt: staleAt,
    });

    try {
      const res = await runMonobankJanitorJob2(
        makeArgs({
          dryRun: true,
        })
      );
      expect(res).toEqual({
        processed: 1,
        applied: 0,
        noop: 0,
        failed: 0,
      });

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          janitorClaimedUntil: paymentAttempts.janitorClaimedUntil,
          janitorClaimedBy: paymentAttempts.janitorClaimedBy,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('creating');
      expect(attempt?.janitorClaimedUntil).toBeNull();
      expect(attempt?.janitorClaimedBy).toBeNull();

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('pending');
      expect(order?.status).toBe('INVENTORY_RESERVED');
      expect(order?.inventoryStatus).toBe('reserved');
      expect(order?.stockRestored).toBe(false);
      expect(order?.restockedAt).toBeNull();
    } finally {
      await cleanup(orderId);
    }
  });

  it('skips paid/terminal orders', async () => {
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { orderId, attemptId } = await insertOrderAndAttempt({
      createdAt: staleAt,
      paymentStatus: 'paid',
      orderStatus: 'PAID',
    });

    try {
      const res = await runMonobankJanitorJob2(makeArgs());
      expect(res).toEqual({
        processed: 0,
        applied: 0,
        noop: 0,
        failed: 0,
      });

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .limit(1);
      expect(attempt?.status).toBe('creating');
    } finally {
      await cleanup(orderId);
    }
  });
});
