import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { restockStalePendingOrders } from '@/lib/services/orders';

describe('restockStalePendingOrders claim gate', () => {
  it('must skip orders with an active (not expired) claim', async () => {
    const orderId = crypto.randomUUID();
    const idem = `test-claim-gate-${crypto.randomUUID()}`;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const claimNow = new Date();
    const activeExpires = new Date(Date.now() + 5 * 60 * 1000);

    try {
      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'requires_payment',
        paymentIntentId: null,

        status: 'CREATED',
        inventoryStatus: 'none',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        sweepClaimedAt: claimNow,
        sweepClaimExpiresAt: activeExpires,
        sweepRunId: crypto.randomUUID(),
        sweepClaimedBy: 'other-worker',

        createdAt,
        updatedAt: createdAt,
      });

      const processed = await restockStalePendingOrders({
        olderThanMinutes: 60,
        batchSize: 50,
        orderIds: [orderId],
        claimTtlMinutes: 5,
        workerId: 'test',
      });

      expect(processed).toBe(0);

      const [row] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row?.stockRestored).toBe(false);
      expect(row?.restockedAt).toBeNull();
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        console.error('[test cleanup failed]', {
          file: 'restock-stale-claim-gate.test.ts',
          test: 'skip active claim',
          step: 'delete order by id',
          orderId,
          idem,
          error,
        });
      }
    }
  }, 30_000);

  it('must process orders with an expired claim', async () => {
    const orderId = crypto.randomUUID();
    const idem = `test-claim-expired-${crypto.randomUUID()}`;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const claimNow = new Date(Date.now() - 10 * 60 * 1000);
    const expiredAt = new Date(Date.now() - 5 * 60 * 1000);

    try {
      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'requires_payment',
        paymentIntentId: null,

        status: 'CREATED',
        inventoryStatus: 'none',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        sweepClaimedAt: claimNow,
        sweepClaimExpiresAt: expiredAt,
        sweepRunId: crypto.randomUUID(),
        sweepClaimedBy: 'dead-worker',

        createdAt,
        updatedAt: createdAt,
      });

      const processed = await restockStalePendingOrders({
        olderThanMinutes: 60,
        batchSize: 50,
        orderIds: [orderId],
        claimTtlMinutes: 5,
        workerId: 'test',
      });

      expect(processed).toBe(1);
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        console.error('[test cleanup failed]', {
          file: 'restock-stale-claim-gate.test.ts',
          test: 'process expired claim',
          step: 'delete order by id',
          orderId,
          idem,
          error,
        });
      }
    }
  }, 30_000);
});
