import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { createProduct } from '@/lib/services/products';
import { updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

vi.mock('@/lib/cloudinary', () => ({
  uploadProductImageFromFile: vi.fn(async () => ({
    secureUrl: 'https://example.com/test.png',
    publicId: 'products/test',
  })),
  destroyProductImage: vi.fn(async () => {}),
}));

function uniqueSlug(prefix = 'phase8-price-authority') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe.sequential('product_prices write authority (phase 8)', () => {
  const createdProductIds: string[] = [];

  beforeAll(() => {
    assertNotProductionDb();
  });

  afterEach(async () => {
    for (const productId of createdProductIds.splice(0)) {
      await db
        .delete(productPrices)
        .where(eq(productPrices.productId, productId))
        .catch(() => undefined);
      await db
        .delete(products)
        .where(eq(products.id, productId))
        .catch(() => undefined);
    }
  });

  it('updates USD row in product_prices without mutating legacy products.price fields', async () => {
    const [product] = await db
      .insert(products)
      .values({
        slug: uniqueSlug(),
        title: 'Phase8 USD update',
        description: null,
        imageUrl: 'https://example.com/p8-usd.png',
        imagePublicId: null,
        price: toDbMoney(1000),
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
        sku: null,
      })
      .returning();

    createdProductIds.push(product.id);

    await db.insert(productPrices).values({
      productId: product.id,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
    });

    await updateProduct(product.id, {
      prices: [{ currency: 'USD', priceMinor: 2500, originalPriceMinor: null }],
    } as any);

    const [legacy] = await db
      .select({
        price: products.price,
        originalPrice: products.originalPrice,
      })
      .from(products)
      .where(eq(products.id, product.id))
      .limit(1);

    const [usd] = await db
      .select({
        priceMinor: productPrices.priceMinor,
        originalPriceMinor: productPrices.originalPriceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, product.id),
          eq(productPrices.currency, 'USD')
        )
      )
      .limit(1);

    expect(String(legacy.price)).toBe(String(toDbMoney(1000)));
    expect(legacy.originalPrice).toBeNull();
    expect(usd.priceMinor).toBe(2500);
    expect(usd.originalPriceMinor).toBeNull();
  });

  it('upserts non-USD row in product_prices without mutating legacy products.price fields', async () => {
    const [product] = await db
      .insert(products)
      .values({
        slug: uniqueSlug(),
        title: 'Phase8 UAH upsert',
        description: null,
        imageUrl: 'https://example.com/p8-uah.png',
        imagePublicId: null,
        price: toDbMoney(1200),
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
        sku: null,
      })
      .returning();

    createdProductIds.push(product.id);

    await db.insert(productPrices).values({
      productId: product.id,
      currency: 'USD',
      priceMinor: 1200,
      originalPriceMinor: null,
      price: toDbMoney(1200),
      originalPrice: null,
    });

    await updateProduct(product.id, {
      prices: [{ currency: 'UAH', priceMinor: 4700, originalPriceMinor: null }],
    } as any);

    const [legacy] = await db
      .select({
        price: products.price,
        originalPrice: products.originalPrice,
      })
      .from(products)
      .where(eq(products.id, product.id))
      .limit(1);

    const [usd] = await db
      .select({
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, product.id),
          eq(productPrices.currency, 'USD')
        )
      )
      .limit(1);

    const [uah] = await db
      .select({
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, product.id),
          eq(productPrices.currency, 'UAH')
        )
      )
      .limit(1);

    expect(String(legacy.price)).toBe(String(toDbMoney(1200)));
    expect(legacy.originalPrice).toBeNull();
    expect(usd.priceMinor).toBe(1200);
    expect(uah.priceMinor).toBe(4700);
  });

  it('updates a UAH-only product row without requiring a dormant USD price row', async () => {
    const created = await createProduct({
      title: 'Phase8 UAH-only update',
      slug: uniqueSlug(),
      description: null,
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 10,
      prices: [{ currency: 'UAH', priceMinor: 4100, originalPriceMinor: null }],
      image: new File([new Uint8Array([1, 2, 3])], 'p8-uah-only.png', {
        type: 'image/png',
      }),
    } as any);

    createdProductIds.push(created.id);

    await updateProduct(created.id, {
      prices: [{ currency: 'UAH', priceMinor: 4300, originalPriceMinor: null }],
    } as any);

    const [legacy] = await db
      .select({
        price: products.price,
        currency: products.currency,
      })
      .from(products)
      .where(eq(products.id, created.id))
      .limit(1);

    const [usd] = await db
      .select({
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, created.id),
          eq(productPrices.currency, 'USD')
        )
      )
      .limit(1);

    const [uah] = await db
      .select({
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, created.id),
          eq(productPrices.currency, 'UAH')
        )
      )
      .limit(1);

    expect(legacy.currency).toBe('USD');
    expect(String(legacy.price)).toBe(String(toDbMoney(4100)));
    expect(usd).toBeUndefined();
    expect(uah?.priceMinor).toBe(4300);
  });
});
