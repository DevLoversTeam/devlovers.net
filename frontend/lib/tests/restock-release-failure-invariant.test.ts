import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, it, expect, vi } from 'vitest';

import { db } from '@/db';
import {
  orders,
  orderItems,
  products,
  productPrices,
  inventoryMoves,
} from '@/db/schema/shop';
import { toDbMoney } from '@/lib/shop/money';
import { restockOrder } from '@/lib/services/orders/restock';
import * as inventory from '@/lib/services/inventory';

describe('P0 Inventory release invariants', () => {
  it('must NOT mark released/stockRestored/restockedAt when applyReleaseMove fails (leave safe for janitor)', async () => {
    const productId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const idemKey = `t_${crypto.randomUUID()}`;
    const requestHash = crypto.randomBytes(16).toString('hex');

    const slug = `t-${productId.slice(0, 8)}`;
    const sku = `SKU-${productId.slice(0, 8)}`;

    // Keep references for cleanup
    const now = new Date();

    // Spy/mocking: force release to fail
    // NOTE: if applyReleaseMove throws in your impl, mockRejectedValueOnce is also OK.
    const releaseSpy = vi
      .spyOn(inventory, 'applyReleaseMove')
      .mockRejectedValue(new Error('SIMULATED_RELEASE_FAIL'));

    try {
      // 1) Seed product + price
      await db.insert(products).values({
        id: productId,
        slug,
        title: 'Test product',
        description: 'Test description',
        imageUrl: 'https://example.com/test.png',
        imagePublicId: 'test-public-id', // додай одразу, щоб не впертись у NOT NULL, якщо він є
        sku,

        // IMPORTANT: products.price is NOT NULL (legacy)
        currency: 'USD',
        price: toDbMoney(1000), // 10.00
        originalPrice: null,

        stock: 1,
        isActive: true,

        createdAt: now,
        updatedAt: now,
      } as any);

      await db.insert(productPrices).values({
        productId,
        currency: 'USD',
        // canonical minor (int)
        priceMinor: 1000,
        // legacy fallback (numeric)
        price: 10,
        originalPrice: null,
      } as any);

      // 2) Seed order + order item (minimal required fields)
      await db.insert(orders).values({
        id: orderId,
        totalAmountMinor: 1000,
        totalAmount: toDbMoney(1000),
        currency: 'USD',

        paymentProvider: 'stripe',
        paymentIntentId: null,
        paymentStatus: 'failed', // we are testing restock on "failed" path

        status: 'INVENTORY_FAILED',
        inventoryStatus: 'reserving', // will reserve first, then switch to release_pending
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

      // 3) Create an ACTUAL reservation move (so “release” is реально потрібен)
      //    This should decrement product stock from 1 -> 0.
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

      // 4) Put order into release_pending so restockOrder will attempt release
      await db
        .update(orders)
        .set({
          inventoryStatus: 'release_pending',
          status: 'INVENTORY_FAILED',
          updatedAt: new Date(),
        } as any)
        .where(eq(orders.id, orderId));

      // 5) Call restockOrder — release fails; function may throw OR no-op, but must NOT finalize release fields
      try {
        await restockOrder(orderId, {
          reason: 'failed',
          workerId: 'test',
        } as any);
      } catch {
        // acceptable: some implementations throw for manual/admin path
      }

      // 6) Assert invariants: order NOT finalized to released/stockRestored/restockedAt
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

      // Key invariants:
      expect(o!.inventoryStatus).not.toBe('released');
      expect(o!.stockRestored).toBe(false);
      expect(o!.restockedAt).toBeNull();

      // 7) Assert product stock DID NOT increment (release not confirmed)
      const [pAfterFail] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(pAfterFail?.stock).toBe(0);
    } finally {
      releaseSpy.mockRestore();

      // cleanup (best-effort)
      try {
        // delete ledger rows for this order if table exists in your schema
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
