import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { describe, expect,it } from 'vitest';

import { db } from '@/db';
import { orders } from '@/db/schema';
import { restockStalePendingOrders } from '@/lib/services/orders';
import { toDbMoney } from '@/lib/shop/money';

describe('P0-3.x Restock stale pending orders: stripe orphan cleanup', () => {
  it('marks stale stripe orphan (no inventory_moves) as terminal failed and releases to avoid infinite sweep re-pick', async () => {
    const orderId = crypto.randomUUID();
    const idem = `test-stale-orphan-stripe-${crypto.randomUUID()}`;

    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
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

        stockRestored: false,
        restockedAt: null,

        idempotencyKey: idem,

        createdAt,
        updatedAt: createdAt,
      });

      const processed = await restockStalePendingOrders({
        olderThanMinutes: 60,
        batchSize: 50,
        orderIds: [orderId],
      });

      expect(processed).toBeGreaterThan(0);

      const [row] = await db
        .select({
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          paymentStatus: orders.paymentStatus,
          failureCode: orders.failureCode,
          failureMessage: orders.failureMessage,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row).toBeTruthy();
      expect(row!.status).toBe('INVENTORY_FAILED');
      expect(row!.inventoryStatus).toBe('released');
      expect(row!.paymentStatus).toBe('failed');
      expect(row!.failureCode).toBe('STALE_ORPHAN');
      expect(row!.failureMessage).toBe(
        'Orphan order: no inventory reservation was recorded.'
      );
      expect(row!.stockRestored).toBe(true);
      expect(row!.restockedAt).not.toBeNull();
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        console.error('[test cleanup failed]', {
          file: 'restock-stale-stripe-orphan.test.ts',
          test: 'stale stripe orphan -> terminal failed + released',
          step: 'delete order by id',
          orderId,
          idem,
          error,
        });
      }
    }
  });
}, 20000);
