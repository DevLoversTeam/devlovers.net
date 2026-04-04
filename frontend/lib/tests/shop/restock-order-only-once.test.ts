import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentEvents, products } from '@/db/schema';
import { OrderStateInvalidError } from '@/lib/services/errors';
import { applyReserveMove } from '@/lib/services/inventory';
import * as inventory from '@/lib/services/inventory';
import { restockOrder } from '@/lib/services/orders';
import { toDbMoney } from '@/lib/shop/money';

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

function logCleanupFailed(payload: {
  test: string;
  orderId: string;
  productId: string;
  step: string;
  error: unknown;
}) {
  console.error('[test cleanup failed]', payload);
}

async function readCanceledEvents(orderId: string) {
  return db
    .select({
      id: paymentEvents.id,
      eventSource: paymentEvents.eventSource,
      eventName: paymentEvents.eventName,
    })
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.orderId, orderId),
        eq(paymentEvents.eventName, 'order_canceled')
      )
    );
}

describe('P0-8.4.2 restockOrder: order-level gate + idempotency', () => {
  it('duplicate failed restock must not increment stock twice and must not change restocked_at', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;

    const initialStock = 5;
    const qty = 2;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const idem = `test-restock-${crypto.randomUUID()}`;

    try {
      await db.insert(products).values({
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
      } as any);

      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'failed',
        paymentIntentId: null,

        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        createdAt,
        updatedAt: createdAt,
      });

      const r = await applyReserveMove(orderId, productId, qty);
      expect(r.ok).toBe(true);

      const stockAfterReserve = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfterReserve[0]?.stock).toBe(initialStock - qty);

      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'test',
        claimTtlMinutes: 5,
      });

      const [after1] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after1.stockRestored).toBe(true);
      expect(after1.restockedAt).not.toBeNull();

      const releaseKey = `release:${orderId}:${productId}`;
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter1 = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter1[0]?.stock).toBe(initialStock);

      await restockOrder(orderId, {
        reason: 'failed',
        workerId: 'test',
        claimTtlMinutes: 5,
      });

      const [after2] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after2.stockRestored).toBe(true);
      expect(after2.restockedAt?.getTime()).toBe(after1.restockedAt?.getTime());
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter2 = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter2[0]?.stock).toBe(initialStock);
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: duplicate failed restock',
          orderId,
          productId,
          step: 'delete orders',
          error,
        });
      }
      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: duplicate failed restock',
          orderId,
          productId,
          step: 'delete products',
          error,
        });
      }
    }
  }, 30_000);

  it('two concurrent restocks must process/finalize only once', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;

    const initialStock = 5;
    const qty = 2;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const idem = `test-restock-${crypto.randomUUID()}`;

    try {
      await db.insert(products).values({
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
      } as any);

      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'failed',
        paymentIntentId: null,

        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        createdAt,
        updatedAt: createdAt,
      });

      const r = await applyReserveMove(orderId, productId, qty);
      expect(r.ok).toBe(true);

      await Promise.all([
        restockOrder(orderId, {
          reason: 'failed',
          workerId: 'test',
          claimTtlMinutes: 5,
        }),
        restockOrder(orderId, {
          reason: 'failed',
          workerId: 'test',
          claimTtlMinutes: 5,
        }),
      ]);

      const releaseKey = `release:${orderId}:${productId}`;
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter[0]?.stock).toBe(initialStock);

      const [finalOrder] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(finalOrder.stockRestored).toBe(true);
      expect(finalOrder.restockedAt).not.toBeNull();
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: concurrent restocks',
          orderId,
          productId,
          step: 'delete orders',
          error,
        });
      }
      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: concurrent restocks',
          orderId,
          productId,
          step: 'delete products',
          error,
        });
      }
    }
  }, 30_000);

  it('duplicate refund restock must not increment stock twice and must not change restocked_at', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;

    const initialStock = 5;
    const qty = 2;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const idem = `test-restock-${crypto.randomUUID()}`;

    try {
      await db.insert(products).values({
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
      } as any);

      await db.insert(orders).values({
        id: orderId,
        userId: null,

        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentStatus: 'paid',
        paymentIntentId: null,

        status: 'PAID',
        inventoryStatus: 'reserved',

        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,

        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,

        createdAt,
        updatedAt: createdAt,
      } as any);

      const r = await applyReserveMove(orderId, productId, qty);
      expect(r.ok).toBe(true);

      const stockAfterReserve = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfterReserve[0]?.stock).toBe(initialStock - qty);

      await restockOrder(orderId, {
        reason: 'refunded',
        workerId: 'test',
        claimTtlMinutes: 5,
      });

      const [after1] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          paymentStatus: orders.paymentStatus,
          inventoryStatus: orders.inventoryStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after1.stockRestored).toBe(true);
      expect(after1.restockedAt).not.toBeNull();
      expect(after1.paymentStatus).toBe('refunded');
      expect(after1.inventoryStatus).toBe('released');

      const releaseKey = `release:${orderId}:${productId}`;
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter1 = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter1[0]?.stock).toBe(initialStock);

      await restockOrder(orderId, {
        reason: 'refunded',
        workerId: 'test',
        claimTtlMinutes: 5,
      });

      const [after2] = await db
        .select({
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          paymentStatus: orders.paymentStatus,
          inventoryStatus: orders.inventoryStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(after2.stockRestored).toBe(true);
      expect(after2.paymentStatus).toBe('refunded');
      expect(after2.inventoryStatus).toBe('released');
      expect(after2.restockedAt?.getTime()).toBe(after1.restockedAt?.getTime());
      expect(await countMoveKey(releaseKey)).toBe(1);

      const stockAfter2 = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(stockAfter2[0]?.stock).toBe(initialStock);
    } finally {
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: duplicate refund restock',
          orderId,
          productId,
          step: 'delete orders',
          error,
        });
      }
      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: duplicate refund restock',
          orderId,
          productId,
          step: 'delete products',
          error,
        });
      }
    }
  }, 30000);

  it('ensures order_canceled canonical event when a concurrent canceled finalize already completed before this worker finishes', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const idem = `test-restock-${crypto.randomUUID()}`;

    const originalApplyReleaseMove = inventory.applyReleaseMove;
    const releaseSpy = vi.spyOn(inventory, 'applyReleaseMove');

    try {
      await db.insert(products).values({
        id: productId,
        title: 'Test Product',
        slug,
        sku,
        badge: 'NONE',
        imageUrl: 'https://example.com/test.png',
        isActive: true,
        stock: 5,
        price: toDbMoney(1000),
        currency: 'USD',
        createdAt,
        updatedAt: createdAt,
      } as any);

      await db.insert(orders).values({
        id: orderId,
        userId: null,
        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',
        paymentProvider: 'stripe',
        paymentStatus: 'failed',
        paymentIntentId: null,
        status: 'INVENTORY_RESERVED',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,
        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,
        createdAt,
        updatedAt: createdAt,
      } as any);

      const reserved = await applyReserveMove(orderId, productId, 1);
      expect(reserved.ok).toBe(true);

      releaseSpy.mockImplementation(
        async (...args: Parameters<typeof inventory.applyReleaseMove>) => {
          const result = await originalApplyReleaseMove(...args);
          const finalizedAt = new Date();
          await db
            .update(orders)
            .set({
              status: 'CANCELED',
              inventoryStatus: 'released',
              stockRestored: true,
              restockedAt: finalizedAt,
              updatedAt: finalizedAt,
            } as any)
            .where(eq(orders.id, orderId));
          return result;
        }
      );

      await restockOrder(orderId, {
        reason: 'canceled',
        alreadyClaimed: true,
        workerId: 'test-concurrent-cancel',
      });

      const canceledEvents = await readCanceledEvents(orderId);
      expect(canceledEvents).toHaveLength(1);
      expect(canceledEvents[0]?.eventSource).toBe('order_restock');
    } finally {
      releaseSpy.mockRestore();
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: concurrent canceled finalize ensures canonical event',
          orderId,
          productId,
          step: 'delete orders',
          error,
        });
      }
      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: concurrent canceled finalize ensures canonical event',
          orderId,
          productId,
          step: 'delete products',
          error,
        });
      }
    }
  }, 30000);

  it('does not treat released non-refunded state as already finalized for refunded restock recheck', async () => {
    const orderId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const slug = `test-${crypto.randomUUID()}`;
    const sku = `sku-${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const idem = `test-restock-${crypto.randomUUID()}`;

    const originalApplyReleaseMove = inventory.applyReleaseMove;
    const releaseSpy = vi.spyOn(inventory, 'applyReleaseMove');

    try {
      await db.insert(products).values({
        id: productId,
        title: 'Test Product',
        slug,
        sku,
        badge: 'NONE',
        imageUrl: 'https://example.com/test.png',
        isActive: true,
        stock: 5,
        price: toDbMoney(1000),
        currency: 'USD',
        createdAt,
        updatedAt: createdAt,
      } as any);

      await db.insert(orders).values({
        id: orderId,
        userId: null,
        totalAmountMinor: 1234,
        totalAmount: toDbMoney(1234),
        currency: 'USD',
        paymentProvider: 'stripe',
        paymentStatus: 'paid',
        paymentIntentId: null,
        status: 'PAID',
        inventoryStatus: 'reserved',
        failureCode: null,
        failureMessage: null,
        idempotencyRequestHash: null,
        stockRestored: false,
        restockedAt: null,
        idempotencyKey: idem,
        createdAt,
        updatedAt: createdAt,
      } as any);

      const reserved = await applyReserveMove(orderId, productId, 1);
      expect(reserved.ok).toBe(true);

      releaseSpy.mockImplementation(
        async (...args: Parameters<typeof inventory.applyReleaseMove>) => {
          const result = await originalApplyReleaseMove(...args);
          const finalizedAt = new Date();
          await db
            .update(orders)
            .set({
              inventoryStatus: 'released',
              stockRestored: true,
              restockedAt: finalizedAt,
              updatedAt: finalizedAt,
            } as any)
            .where(eq(orders.id, orderId));
          return result;
        }
      );

      await expect(
        restockOrder(orderId, {
          reason: 'refunded',
          alreadyClaimed: true,
          workerId: 'test-concurrent-refund',
        })
      ).rejects.toBeInstanceOf(OrderStateInvalidError);
    } finally {
      releaseSpy.mockRestore();
      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: released non-refunded state is not finalized for refunded recheck',
          orderId,
          productId,
          step: 'delete orders',
          error,
        });
      }
      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        logCleanupFailed({
          test: 'restockOrder: released non-refunded state is not finalized for refunded recheck',
          orderId,
          productId,
          step: 'delete products',
          error,
        });
      }
    }
  }, 30000);
});
