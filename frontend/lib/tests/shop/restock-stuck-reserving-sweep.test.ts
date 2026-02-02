import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { orders, products } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { applyReserveMove } from '@/lib/services/inventory';
import { restockStuckReservingOrders } from '@/lib/services/orders';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function readRows(res: any): any[] {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.rows)) return res.rows;
  return [];
}

async function countMoveKey(moveKey: string): Promise<number> {
  const res = await db.execute(
    sql`select count(*)::int as n from inventory_moves where move_key = ${moveKey}`
  );
  const rows = readRows(res);
  return Number(rows?.[0]?.n ?? 0);
}

async function cleanupTestRows(params: { orderId: string; productId: string }) {
  const { orderId, productId } = params;

  await db.execute(
    sql`delete from inventory_moves where order_id = ${orderId}::uuid`
  );
  await db.execute(
    sql`delete from order_items where order_id = ${orderId}::uuid`
  );

  await db.delete(orders).where(eq(orders.id, orderId));
  await db.delete(products).where(eq(products.id, productId));
}

describe('P0-7 stuckReserving sweep: restock exactly-once', () => {
  it('stuck reserving -> sweep -> terminal + stock restored exactly once; repeat is no-op', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;

    const initialStock = 5;
    const qty = 2;
    const createdAt = new Date(Date.now() - TWO_HOURS_MS);
    const idem = `test-stuck-${crypto.randomUUID()}`;
    let originalError: unknown = null;

    try {
      const productInsert = {
        id: productId,
        title: 'Test Product',
        slug,
        sku,
        badge: 'NONE',
        imageUrl: 'https://example.com/test.png',
        isActive: true,
        stock: initialStock,
        price: toDbMoney(1000),
        currency: 'USD',
        createdAt,
        updatedAt: createdAt,
      } satisfies typeof products.$inferInsert;

      await db.insert(products).values(productInsert);

      const orderInsert = {
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'requires_payment',
        paymentIntentId: null,

        status: 'CREATED',
        inventoryStatus: 'reserving',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        createdAt,
        updatedAt: createdAt,
      } satisfies typeof orders.$inferInsert;

      await db.insert(orders).values(orderInsert);

      const r = await applyReserveMove(orderId, productId, qty);
      expect(r.ok).toBe(true);

      const stockAfterReserve = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfterReserve[0]?.stock).toBe(initialStock - qty);

      const processed1 = await restockStuckReservingOrders({
        olderThanMinutes: 10,
        batchSize: 50,
        claimTtlMinutes: 5,
        workerId: 'test',
        timeBudgetMs: 20_000,
      });

      expect(processed1).toBe(1);

      const [after1] = await db
        .select({
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          paymentStatus: orders.paymentStatus,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          failureCode: orders.failureCode,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after1.stockRestored).toBe(true);
      expect(after1.restockedAt).not.toBeNull();
      expect(after1.paymentStatus).toBe('failed');
      expect(after1.status).toBe('INVENTORY_FAILED');
      expect(after1.inventoryStatus).toBe('released');
      expect(after1.failureCode).toBe('STUCK_RESERVING_TIMEOUT');

      const releaseKey = `release:${orderId}:${productId}`;
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter1 = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter1[0]?.stock).toBe(initialStock);

      const processed2 = await restockStuckReservingOrders({
        olderThanMinutes: 10,
        batchSize: 50,
        claimTtlMinutes: 5,
        workerId: 'test',
        timeBudgetMs: 20_000,
      });

      expect(processed2).toBe(0);
      expect(await countMoveKey(releaseKey)).toBe(1);

      const [after2] = await db
        .select({
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after2.restockedAt?.getTime()).toBe(after1.restockedAt?.getTime());
    } catch (e) {
      originalError = e;
    } finally {
      try {
        await cleanupTestRows({ orderId, productId });
      } catch (cleanupError) {
        if (originalError) {
          console.error('[test cleanup failed]', {
            orderId,
            productId,
            error: cleanupError,
          });
        } else {
          originalError = cleanupError;
        }
      }
    }

    if (originalError) throw originalError;
  }, 30_000);
});
