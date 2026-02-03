import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema/shop';
import * as inventory from '@/lib/services/inventory';
import { restockOrder } from '@/lib/services/orders/restock';
import { toDbMoney } from '@/lib/shop/money';

describe('P0 Inventory release invariants', () => {
  it('must NOT mark released/stockRestored/restockedAt when applyReleaseMove fails (leave safe for janitor)', async () => {
    const productId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const idemKey = `t_${crypto.randomUUID()}`;
    const requestHash = crypto.randomBytes(16).toString('hex');

    const slug = `t-${productId.slice(0, 8)}`;
    const sku = `SKU-${productId.slice(0, 8)}`;

    const now = new Date();

    const releaseSpy = vi
      .spyOn(inventory, 'applyReleaseMove')
      .mockRejectedValue(new Error('SIMULATED_RELEASE_FAIL'));

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: 'Test product',
        description: 'Test description',
        imageUrl: 'https://example.com/test.png',
        imagePublicId: 'test-public-id',
        sku,

        currency: 'USD',
        price: toDbMoney(1000),
        originalPrice: null,

        stock: 1,
        isActive: true,

        createdAt: now,
        updatedAt: now,
      } as any);

      await db.insert(productPrices).values({
        productId,
        currency: 'USD',

        priceMinor: 1000,

        price: 10,
        originalPrice: null,
      } as any);

      await db.insert(orders).values({
        id: orderId,
        totalAmountMinor: 1000,
        totalAmount: toDbMoney(1000),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentIntentId: null,
        paymentStatus: 'failed',

        status: 'INVENTORY_FAILED',
        inventoryStatus: 'reserving',
        failureCode: 'INTERNAL_ERROR',
        failureMessage: 'fail before release',

        stockRestored: false,
        restockedAt: null,

        idempotencyKey: idemKey,
        idempotencyRequestHash: requestHash,
        userId: null,

        createdAt: now,
        updatedAt: now,
      } as any);

      await db.insert(orderItems).values({
        orderId,
        productId,
        selectedSize: '',
        selectedColor: '',
        quantity: 1,

        unitPriceMinor: 1000,
        lineTotalMinor: 1000,

        unitPrice: toDbMoney(1000),
        lineTotal: toDbMoney(1000),

        productTitle: 'Test product',
        productSlug: slug,
        productSku: sku,
      } as any);

      const reserveRes = await inventory.applyReserveMove(
        orderId,
        productId,
        1
      );
      expect(reserveRes?.ok).toBe(true);

      const [pAfterReserve] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(pAfterReserve?.stock).toBe(0);

      await db
        .update(orders)
        .set({
          inventoryStatus: 'release_pending',
          status: 'INVENTORY_FAILED',
          updatedAt: new Date(),
        } as any)
        .where(eq(orders.id, orderId));

      let restockErr: unknown;

      try {
        await restockOrder(orderId, {
          reason: 'failed',
          workerId: 'test',
        } as any);
      } catch (err) {
        restockErr = err;
      }

      if (restockErr) {
        // Accept ONLY the simulated release failure; rethrow anything else.
        if (
          restockErr instanceof Error &&
          restockErr.message.includes('SIMULATED_RELEASE_FAIL')
        ) {
          expect(restockErr).toBeInstanceOf(Error);
          expect(restockErr.message).toContain('SIMULATED_RELEASE_FAIL');
        } else {
          throw restockErr;
        }
      }

      const [o] = await db
        .select({
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(o).toBeTruthy();

      expect(o!.inventoryStatus).not.toBe('released');
      expect(o!.stockRestored).toBe(false);
      expect(o!.restockedAt).toBeNull();

      const [pAfterFail] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(pAfterFail?.stock).toBe(0);
    } finally {
      releaseSpy.mockRestore();

      try {
        if (inventoryMoves) {
          await db
            .delete(inventoryMoves as any)
            .where(eq((inventoryMoves as any).orderId, orderId));
        }
      } catch {
        // ignore
      }

      try {
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      } catch {
        // ignore
      }

      try {
        await db.delete(orders).where(eq(orders.id, orderId));
      } catch {
        // ignore
      }

      try {
        await db
          .delete(productPrices)
          .where(eq(productPrices.productId, productId));
      } catch {
        // ignore
      }

      try {
        await db.delete(products).where(eq(products.id, productId));
      } catch {
        // ignore
      }
    }
  });
});
