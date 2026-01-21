import crypto from 'crypto';
import { and, eq, inArray, isNull, lt, or, sql, ne } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type PaymentStatus } from '@/lib/shop/payments';

import { restockOrder } from './restock';

export async function restockStalePendingOrders(options?: {
  olderThanMinutes?: number;
  batchSize?: number;
  orderIds?: string[];
  claimTtlMinutes?: number; // claim TTL window
  workerId?: string; // identify who claimed
  timeBudgetMs?: number; // max runtime budget for this sweep
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

  // If explicitly provided empty list => nothing to do (test helper).
  if (options?.orderIds && options.orderIds.length === 0) return 0;

  const hasExplicitIds = Boolean(options?.orderIds?.length);
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  let processed = 0;
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      eq(orders.paymentProvider, 'stripe'),
      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      ne(orders.inventoryStatus, 'released'),
      // claim gate: only unclaimed or expired claims are eligible
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    // If not targeting specific orders, apply age cutoff.
    if (!hasExplicitIds) {
      baseConditions.push(lt(orders.createdAt, cutoff));
    }

    if (hasExplicitIds && options?.orderIds?.length) {
      baseConditions.push(inArray(orders.id, options.orderIds));
    }

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

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
// Cleanup for orders stuck in "reserving" phase (inventory reservation started but never completed).
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
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      // Only Stripe flow here; no-payments has its own sweep.
      eq(orders.paymentProvider, 'stripe'),

      // "still in progress" payment states
      inArray(orders.paymentStatus, [
        'pending',
        'requires_payment',
      ] as PaymentStatus[]),

      // stuck in reserving/releasing phase (not final)
      inArray(orders.inventoryStatus, [
        'reserving',
        'release_pending',
      ] as const),

      // not already restocked/finalized
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),

      // age cutoff
      lt(orders.createdAt, cutoff),

      // claim gate
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        // set failure details only if absent (keeps real error if it already exists)
        failureCode: sql`coalesce(${orders.failureCode}, 'STUCK_RESERVING_TIMEOUT')`,
        failureMessage: sql`coalesce(${orders.failureMessage}, 'Order timed out while reserving inventory.')`,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      // IMPORTANT: reuse hardened exactly-once restock
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

// Cleanup for payment_provider='none' flow where payment_status may be 'paid' before inventory reservation completes.
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
  const runId = crypto.randomUUID();

  while (true) {
    if (Date.now() >= deadlineMs) break;

    const now = new Date();
    const claimExpiresAt = new Date(Date.now() + claimTtlMinutes * 60 * 1000);

    const baseConditions = [
      eq(orders.paymentProvider, 'none'),
      eq(orders.stockRestored, false),
      isNull(orders.restockedAt),
      lt(orders.createdAt, cutoff),

      inArray(orders.inventoryStatus, [
        'none',
        'reserving',
        'release_pending',
      ] as const),

      // claim gate
      or(
        isNull(orders.sweepClaimExpiresAt),
        lt(orders.sweepClaimExpiresAt, now)
      ),
    ];

    const claimable = db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...baseConditions))
      .orderBy(orders.createdAt)
      .limit(batchSize);

    const claimed = await db
      .update(orders)
      .set({
        sweepClaimedAt: now,
        sweepClaimExpiresAt: claimExpiresAt,
        sweepRunId: runId,
        sweepClaimedBy: workerId,
        updatedAt: now,
      })
      .where(
        and(
          inArray(orders.id, claimable),
          or(
            isNull(orders.sweepClaimExpiresAt),
            lt(orders.sweepClaimExpiresAt, now)
          )
        )
      )
      .returning({ id: orders.id });

    if (!claimed.length) break;

    for (const { id } of claimed) {
      if (Date.now() >= deadlineMs) break;

      await restockOrder(id, {
        reason: 'stale', // reuse existing terminalization semantics
        alreadyClaimed: true,
        workerId,
      });

      processed += 1;
    }
  }

  return processed;
}

