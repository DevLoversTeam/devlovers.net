import crypto from 'crypto';
import {
  and,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { logDebug } from '@/lib/logging';
import { type PaymentStatus } from '@/lib/shop/payments';

import { restockOrder } from './restock';

function compactConditions(conds: Array<SQLWrapper | undefined>): SQLWrapper[] {
  return conds.filter((c): c is SQLWrapper => Boolean(c));
}

type ClaimOrdersForSweepBatchArgs = {
  now: Date;
  claimExpiresAt: Date;
  runId: string;
  workerId: string;
  batchSize: number;
  baseConditions: SQLWrapper[];
  extraSet?: Record<string, unknown>;
};

async function claimOrdersForSweepBatch(
  args: ClaimOrdersForSweepBatchArgs
): Promise<Array<{ id: string }>> {
  const claimable = db
    .select({ id: orders.id })
    .from(orders)
    .where(and(...args.baseConditions))
    .orderBy(orders.createdAt)
    .limit(args.batchSize)
    .for('update', { skipLocked: true });

  return db
    .update(orders)
    .set({
      sweepClaimedAt: args.now,
      sweepClaimExpiresAt: args.claimExpiresAt,
      sweepRunId: args.runId,
      sweepClaimedBy: args.workerId,
      updatedAt: args.now,
      ...(args.extraSet ?? {}),
    })
    .where(
      and(
        inArray(orders.id, claimable),
        or(
          isNull(orders.sweepClaimExpiresAt),
          lt(orders.sweepClaimExpiresAt, args.now)
        )
      )
    )
    .returning({ id: orders.id });
}

export async function restockStalePendingOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  orderIds?: string[];
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutesRaw = options?.olderThanMinutes ?? 60;
  const batchSizeRaw = options?.batchSize ?? 50;
  const claimTtlMinutesRaw = options?.claimTtlMinutes ?? 5;

  const workerId =
    (options?.workerId ?? 'restock-sweep').trim() || 'restock-sweep';

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(olderThanMinutesRaw)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(batchSizeRaw)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(claimTtlMinutesRaw)))
  );

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  if (options?.orderIds && options.orderIds.length === 0) return 0;

  const hasExplicitIds = Boolean(options?.orderIds?.length);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  let loopCount = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;
    loopCount += 1;

    const now = new Date();
    const claimExpiresAt = new Date(
      now.getTime() + claimTtlMinutes * 60 * 1000
    );

    const baseConditions: SQLWrapper[] = compactConditions([
      eq(orders.paymentProvider, 'stripe'),
      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      ne(orders.inventoryStatus, 'released'),
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ]);

    if (!hasExplicitIds) {
      baseConditions.push(lt(orders.createdAt, cutoff));
    }

    if (hasExplicitIds && options?.orderIds?.length) {
      const idCond = inArray(orders.id, options.orderIds);
      if (idCond) baseConditions.push(idCond);
    }

    const claimed = await claimOrdersForSweepBatch({
      now,
      claimExpiresAt,
      runId,
      workerId,
      batchSize,
      baseConditions,
    });

    logDebug('orders_sweep_claim_batch', {
      sweep: 'stale_pending',
      runId,
      loopCount,
      claimedCount: claimed.length,
    });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale',
        alreadyClaimed: true,
        workerId,
      });
      processed += 1;
    }
  }

  return processed;
}
export async function restockStuckReservingOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(options?.olderThanMinutes ?? 15)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(options?.batchSize ?? 50)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(options?.claimTtlMinutes ?? 5)))
  );

  const workerId =
    (options?.workerId ?? 'restock-stuck-reserving-sweep').trim() ||
    'restock-stuck-reserving-sweep';

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  let loopCount = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;
    loopCount += 1;

    const now = new Date();
    const claimExpiresAt = new Date(
      now.getTime() + claimTtlMinutes * 60 * 1000
    );

    const baseConditions: SQLWrapper[] = compactConditions([
      eq(orders.paymentProvider, 'stripe'),

      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),

      inArray(orders.inventoryStatus, [
        'reserving',
        'release_pending',
      ] as const),

      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),

      lt(orders.createdAt, cutoff),

      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ]);

    const claimed = await claimOrdersForSweepBatch({
      now,
      claimExpiresAt,
      runId,
      workerId,
      batchSize,
      baseConditions,
      extraSet: {
        failureCode: sql`coalesce(${orders.failureCode}, 'STUCK_RESERVING_TIMEOUT')`,
        failureMessage: sql`coalesce(${orders.failureMessage}, 'Order timed out while reserving inventory.')`,
      },
    });

    logDebug('orders_sweep_claim_batch', {
      sweep: 'stuck_reserving',
      runId,
      loopCount,
      claimedCount: claimed.length,
    });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale',
        alreadyClaimed: true,
        workerId,
      });

      processed += 1;
    }
  }

  return processed;
}

export async function restockStaleNoPaymentOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  claimTtlMinutes?: number;
  workerId?: string;
  timeBudgetMs?: number;
}): Promise<number> {
  const MIN_OLDER_MIN = 10;
  const MAX_OLDER_MIN = 60 * 24 * 7;
  const MIN_BATCH = 25;
  const MAX_BATCH = 100;
  const MIN_CLAIM_TTL = 1;
  const MAX_CLAIM_TTL = 60;

  const DEFAULT_TIME_BUDGET_MS = 20_000;
  const MIN_TIME_BUDGET_MS = 0;
  const MAX_TIME_BUDGET_MS = 25_000;

  const olderThanMinutes = Math.max(
    MIN_OLDER_MIN,
    Math.min(MAX_OLDER_MIN, Math.floor(Number(options?.olderThanMinutes ?? 30)))
  );

  const batchSize = Math.max(
    MIN_BATCH,
    Math.min(MAX_BATCH, Math.floor(Number(options?.batchSize ?? 50)))
  );

  const claimTtlMinutes = Math.max(
    MIN_CLAIM_TTL,
    Math.min(MAX_CLAIM_TTL, Math.floor(Number(options?.claimTtlMinutes ?? 5)))
  );

  const workerId =
    (options?.workerId ?? 'restock-nopay-sweep').trim() ||
    'restock-nopay-sweep';

  const timeBudgetMs = Math.max(
    MIN_TIME_BUDGET_MS,
    Math.min(
      MAX_TIME_BUDGET_MS,
      Math.floor(Number(options?.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS))
    )
  );
  const deadlineMs = Date.now() + timeBudgetMs;

  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  let loopCount = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;
    loopCount += 1;

    const now = new Date();
    const claimExpiresAt = new Date(
      now.getTime() + claimTtlMinutes * 60 * 1000
    );

    const baseConditions: SQLWrapper[] = compactConditions([
      eq(orders.paymentProvider, 'none'),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      lt(orders.createdAt, cutoff),

      inArray(orders.inventoryStatus, [
        'none',
        'reserving',
        'release_pending',
      ] as const),

      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ]);

    const claimed = await claimOrdersForSweepBatch({
      now,
      claimExpiresAt,
      runId,
      workerId,
      batchSize,
      baseConditions,
    });

    logDebug('orders_sweep_claim_batch', {
      sweep: 'stale_no_payment',
      runId,
      loopCount,
      claimedCount: claimed.length,
    });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale',
        alreadyClaimed: true,
        workerId,
      });

      processed += 1;
    }
  }

  return processed;
}
