import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { products, productPrices, orders, orderItems } from '@/db/schema/shop';
import { createOrderWithItems } from '@/lib/services/orders';

describe('order_items variants (selected_size/selected_color)', () => {
  it('creates two distinct order_items rows for same product with different variants', async () => {
    const productId = crypto.randomUUID();
    const priceId = crypto.randomUUID();
    const slug = `test-variants-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    let orderId: string | null = null;

    await db.insert(products).values({
      id: productId,
      slug,
      title: 'Test Product (variants)',
      imageUrl: 'https://example.com/test.png',
      price: '18.00',
      currency: 'USD',
      isActive: true,
      stock: 50,

      ...({
        sizes: ['S', 'M'],
        colors: ['Red'],
      } as any),
    } as any);

    await db.insert(productPrices).values({
      id: priceId,
      productId,
      currency: 'USD',
      priceMinor: 1800,
      originalPriceMinor: null,
      price: '18.00',
      originalPrice: null,
    });

    try {
      const idem = crypto.randomUUID();
      const result = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'en-US',
        items: [
          {
            productId,
            quantity: 1,

            selectedSize: 'S',
            selectedColor: 'Red',
          } as any,
          {
            productId,
            quantity: 1,

            selectedSize: 'M',
            selectedColor: 'Red',
          } as any,
        ],
      });

      orderId = result.order.id;

      expect(result.order.items.length).toBe(2);
      const norm = (v: unknown) =>
        String(v ?? '')
          .trim()
          .toLowerCase();

      const sizes = result.order.items.map(i => norm((i as any).selectedSize));
      const colors = result.order.items.map(i =>
        norm((i as any).selectedColor)
      );

      expect(sizes.sort()).toEqual(['m', 's']);
      expect(colors.sort()).toEqual(['red', 'red']);

      const rows = await db
        .select({
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          selectedSize: orderItems.selectedSize,
          selectedColor: orderItems.selectedColor,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      expect(rows.length).toBe(2);

      const rowKeys = rows
        .map(
          r => `${r.productId}|${norm(r.selectedSize)}|${norm(r.selectedColor)}`
        )
        .sort();

      expect(rowKeys).toEqual([`${productId}|m|red`, `${productId}|s|red`]);
    } finally {
      if (orderId) {
        await db.delete(orders).where(eq(orders.id, orderId));
      }

      await db.delete(products).where(eq(products.id, productId));

      try {
        await db.execute(
          sql`delete from product_prices where product_id = ${productId}::uuid`
        );
      } catch (error) {
        console.error('[test cleanup failed]', {
          file: 'order-items-variants.test.ts',
          test: 'order_items variants: distinct rows for different variants',
          step: 'delete product_prices fallback by productId',
          orderId,
          productId,
          priceId,
          error,
        });
      }
    }
  }, 60_000);
});
