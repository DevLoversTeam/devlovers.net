import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { rehydrateCartItems } from '@/lib/services/products';

let productId: string;

beforeAll(async () => {
  productId = crypto.randomUUID();

  await db.insert(products).values({
    id: productId,
    slug: `test-cart-${productId}`,
    title: 'Test Product',
    description: null,
    imageUrl: 'https://example.com/test.jpg',
    imagePublicId: null,
    price: '10.00',
    originalPrice: null,
    currency: 'USD',
    category: null,
    type: null,
    colors: ['black'],
    sizes: ['S', 'M'],
    badge: 'NONE',
    isActive: true,
    isFeatured: false,
    stock: 10,
    sku: null,
  });

  await db.insert(productPrices).values({
    id: crypto.randomUUID(),
    productId,
    currency: 'USD',
    priceMinor: 1000,
    originalPriceMinor: null,
    price: '10.00',
    originalPrice: null,
  });
});

afterAll(async () => {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
});

describe('cart rehydrate: variant sanitization', () => {
  it('drops invalid selectedSize and merges lines after sanitization', async () => {
    const result = await rehydrateCartItems(
      [
        {
          productId,
          quantity: 1,
          selectedSize: 'INVALID',
          selectedColor: 'black',
        },
        {
          productId,
          quantity: 2,
          selectedColor: 'black',
        },
      ],
      'USD'
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.quantity).toBe(3);
    expect(result.items[0]!.selectedSize).toBeUndefined();
    expect(result.items[0]!.selectedColor).toBe('black');
    expect(result.summary.totalAmountMinor).toBe(3000);
  });

  it('drops invalid selectedColor and merges lines after sanitization', async () => {
    const result = await rehydrateCartItems(
      [
        {
          productId,
          quantity: 1,
          selectedSize: 'S',
          selectedColor: 'INVALID',
        },
        {
          productId,
          quantity: 2,
          selectedSize: 'S',
        },
      ],
      'USD'
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.quantity).toBe(3);
    expect(result.items[0]!.selectedSize).toBe('S');
    expect(result.items[0]!.selectedColor).toBeUndefined();
    expect(result.summary.totalAmountMinor).toBe(3000);
  });
});
