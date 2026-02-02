import { describe, it, expect, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';

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
import { products, productPrices } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { createProduct, updateProduct } from '@/lib/services/products';

function uniqueSlug(prefix = 'sale-invariant') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
        prices: [
          {
            currency: 'USD',
            priceMinor: 1000,
            originalPriceMinor: null,
          },
        ],
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

    await db.insert(productPrices).values({
      productId: p.id,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: 2000,
      price: toDbMoney(1000),
      originalPrice: toDbMoney(2000),
    });

    await expect(
      updateProduct(p.id, {
        prices: [
          {
            currency: 'USD',
            priceMinor: 1000,
            originalPriceMinor: null,
          },
        ],
      } as any)
    ).rejects.toThrow(/SALE badge requires originalPrice/i);

    const [pp] = await db
      .select({
        priceMinor: productPrices.priceMinor,
        originalPriceMinor: productPrices.originalPriceMinor,
      })
      .from(productPrices)
      .where(eq(productPrices.productId, p.id))
      .limit(1);

    expect(pp.priceMinor).toBe(1000);
    expect(pp.originalPriceMinor).toBe(2000);
  }, 30_000);
});
