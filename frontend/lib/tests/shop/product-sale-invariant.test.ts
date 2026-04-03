import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cloudinary', () => {
  return {
    uploadProductImageFromFile: vi.fn(async () => ({
      secureUrl: 'https://example.com/test.png',
      publicId: 'test_public_id',
    })),
    destroyProductImage: vi.fn(async () => {}),
  };
});

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { createProduct, updateProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';

function uniqueSlug(prefix = 'sale-invariant') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dualCurrencyPrices(
  priceMinor: number,
  originalPriceMinor: number | null
) {
  return [
    { currency: 'UAH' as const, priceMinor, originalPriceMinor },
    { currency: 'USD' as const, priceMinor, originalPriceMinor },
  ];
}

describe('SALE invariant: originalPriceMinor is required', () => {
  const createdProductIds: string[] = [];

  afterEach(async () => {
    for (const id of createdProductIds.splice(0)) {
      await db.delete(products).where(eq(products.id, id));
    }
  });

  it('createProduct: badge=SALE + prices without originalPriceMinor must reject', async () => {
    await expect(
      createProduct({
        title: 'Sale product',
        badge: 'SALE',
        image: {} as any,
        prices: dualCurrencyPrices(1000, null),
        stock: 10,
        isActive: true,
      } as any)
    ).rejects.toThrow(/SALE badge requires originalPrice/i);
  }, 30_000);

  it('updateProduct: existing SALE + PATCH that removes originalPriceMinor must reject (final state invariant)', async () => {
    const slug = uniqueSlug();

    const [p] = await db
      .insert(products)
      .values({
        slug,
        title: 'Seed SALE product',
        description: null,
        imageUrl: 'https://example.com/seed.png',
        imagePublicId: null,
        price: toDbMoney(1000),
        originalPrice: toDbMoney(2000),
        currency: 'USD',
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: 'SALE',
        isActive: true,
        isFeatured: false,
        stock: 5,
        sku: null,
      })
      .returning();

    createdProductIds.push(p.id);

    await db.insert(productPrices).values(
      dualCurrencyPrices(1000, 2000).map(price => ({
        productId: p.id,
        currency: price.currency,
        priceMinor: price.priceMinor,
        originalPriceMinor: price.originalPriceMinor,
        price: toDbMoney(price.priceMinor),
        originalPrice:
          price.originalPriceMinor == null
            ? null
            : toDbMoney(price.originalPriceMinor),
      }))
    );

    await expect(
      updateProduct(p.id, {
        prices: dualCurrencyPrices(1000, null),
      } as any)
    ).rejects.toThrow(/SALE badge requires originalPrice/i);

    const rows = await db
      .select({
        priceMinor: productPrices.priceMinor,
        originalPriceMinor: productPrices.originalPriceMinor,
      })
      .from(productPrices)
      .where(eq(productPrices.productId, p.id))
      .limit(2);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          priceMinor: 1000,
          originalPriceMinor: 2000,
        }),
      ])
    );
  }, 30_000);
});
