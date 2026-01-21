import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { restockStalePendingOrders } from '@/lib/services/orders';

describe('restockStalePendingOrders claim', () => {
  it('two concurrent sweeps must not both process the same order', async () => {
    const orderId = crypto.randomUUID();
    const idem = `test-claim-${crypto.randomUUID()}`;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const totalAmountMinor = 1234;

    try {
      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor,
        totalAmount: toDbMoney(totalAmountMinor),
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

        createdAt,
        updatedAt: createdAt,
      });

      const [a, b] = await Promise.all([
        restockStalePendingOrders({
          olderThanMinutes: 60,
          batchSize: 50,
          orderIds: [orderId],
          claimTtlMinutes: 5,
          workerId: 'test',
        }),
        restockStalePendingOrders({
          olderThanMinutes: 60,
          batchSize: 50,
          orderIds: [orderId],
          claimTtlMinutes: 5,
          workerId: 'test',
        }),
      ]);

      expect(a + b).toBe(1);
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        console.error('[test cleanup failed]', {
          file: 'restock-sweep-claim.test.ts',
          test: 'two concurrent sweeps must not both process the same order',
          step: 'delete order by id',
          orderId,
          idem,
          error,
        });
      }
    }
  });
}, 20000);
