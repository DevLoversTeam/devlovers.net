// lib/tests/order-items-snapshot-immutable.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { db } from '@/db';
import {
  products,
  productPrices,
  orders,
  orderItems,
  inventoryMoves,
} from '@/db/schema';

// IMPORTANT: checkout route calls getCurrentUser(), which uses next/headers cookies()
// In vitest there is no request scope, so we must mock it to avoid noisy error + flakiness.
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: vi.fn(async () => null),
  };
});

// Force "no-payments" path so checkout never touches Stripe network.
// This test is only about snapshot immutability.
vi.mock('@/lib/env/stripe', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/lib/env/stripe'
  );
  return {
    ...actual,
    isPaymentsEnabled: () => false,
  };
});

import { POST as checkoutPOST } from '@/app/api/shop/checkout/route';

type CheckoutResponse = {
  success: boolean;
  orderId?: string;
  order?: { id?: string };
};

function makeJsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string>
) {
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  } as any);
}

async function cleanupByIds(params: { orderId?: string; productId: string }) {
  const { orderId, productId } = params;

  if (orderId) {
    // delete children first
    await db.delete(inventoryMoves).where(eq(inventoryMoves.orderId, orderId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  await db.delete(productPrices).where(eq(productPrices.productId, productId));

  await db.delete(products).where(eq(products.id, productId));
}

describe('P0-6 snapshots: order_items immutability', () => {
  it('snapshot fields must not change after products/product_prices update', async () => {
    const productId = randomUUID();
    const priceId = randomUUID();

    const titleV1 = 'Snapshot Test Product';
    const slugV1 = `snapshot-test-${productId.slice(0, 8)}`;
    const skuV1 = `SKU-${productId.slice(0, 8)}`;

    // Seed product (USD-only per your CHECK constraint)
    await db.insert(products).values({
      id: productId,
      slug: slugV1,
      title: titleV1,
      description: 'snapshot test',
      imageUrl: 'https://res.cloudinary.com/devlovers/image/upload/v1/test.png',
      imagePublicId: null,
      price: '9.00',
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 10,
      sku: skuV1,
    });

    // Seed product_prices (USD)
    await db.insert(productPrices).values({
      id: priceId,
      productId,
      currency: 'USD',
      priceMinor: 900,
      originalPriceMinor: null,
      price: '9.00',
      originalPrice: null,
    });

    const idem = randomUUID();
    const req = makeJsonRequest(
      'http://localhost:3000/api/shop/checkout',
      { items: [{ productId, quantity: 1 }] },
      {
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Idempotency-Key': idem,
      }
    );

    const res = await checkoutPOST(req);

    // Your checkout returns 201 Created on success.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const json = (await res.json()) as CheckoutResponse;
    expect(json.success).toBe(true);

    const orderId = json.orderId ?? json.order?.id;
    expect(typeof orderId).toBe('string');
    if (!orderId) throw new Error('Missing orderId from checkout response');

    try {
      // Baseline snapshot
      const before = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPriceMinor: orderItems.unitPriceMinor,
          lineTotalMinor: orderItems.lineTotalMinor,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      expect(before.length).toBe(1);
      expect(before[0].productId).toBe(productId);
      expect(before[0].productTitle).toBe(titleV1);
      expect(before[0].productSlug).toBe(slugV1);
      expect(before[0].productSku).toBe(skuV1);
      expect(before[0].unitPriceMinor).toBe(900);
      expect(before[0].lineTotalMinor).toBe(900);

      // Mutate product + product_prices aggressively (attempt to "break" snapshots)
      const titleV2 = `${titleV1} UPDATED`;
      const slugV2 = `${slugV1}-updated`;
      const skuV2 = `${skuV1}-UPDATED`;

      await db
        .update(products)
        .set({
          title: titleV2,
          slug: slugV2,
          sku: skuV2,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await db
        .update(productPrices)
        .set({
          priceMinor: 1000,
          price: '10.00',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productPrices.productId, productId),
            eq(productPrices.currency, 'USD')
          )
        );

      const after = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPriceMinor: orderItems.unitPriceMinor,
          lineTotalMinor: orderItems.lineTotalMinor,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      expect(after.length).toBe(1);

      // Snapshot MUST remain V1 even after product changes
      expect(after[0]).toEqual(before[0]);
    } finally {
      await cleanupByIds({ orderId, productId });
    }
  }, 30_000);
});
