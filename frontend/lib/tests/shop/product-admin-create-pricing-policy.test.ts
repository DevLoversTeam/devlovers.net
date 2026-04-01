import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { PriceConfigError } from '@/lib/services/errors';
import { createProduct } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';
import { productAdminSchema } from '@/lib/validation/shop';

vi.mock('@/lib/cloudinary', () => ({
  uploadProductImageFromFile: vi.fn(async () => ({
    secureUrl: 'https://example.com/admin-uah-only.png',
    publicId: 'products/admin-uah-only',
  })),
  destroyProductImage: vi.fn(async () => {}),
}));

function uniqueSlug(prefix = 'admin-create-price-policy') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe.sequential('admin create pricing policy', () => {
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

  it('accepts UAH-only pricing in the admin create schema', () => {
    const result = productAdminSchema.safeParse({
      title: 'UAH-only schema product',
      slug: uniqueSlug('admin-schema-uah-only'),
      prices: [{ currency: 'UAH', priceMinor: 5100, originalPriceMinor: null }],
      badge: 'NONE',
      colors: [],
      sizes: [],
      stock: 2,
      isActive: true,
      isFeatured: false,
    });

    expect(result.success).toBe(true);
  });

  it('rejects USD-only pricing in the admin create schema', () => {
    const result = productAdminSchema.safeParse({
      title: 'USD-only schema product',
      slug: uniqueSlug('admin-schema-usd-only'),
      prices: [{ currency: 'USD', priceMinor: 5100, originalPriceMinor: null }],
      badge: 'NONE',
      colors: [],
      sizes: [],
      stock: 2,
      isActive: true,
      isFeatured: false,
    });

    expect(result.success).toBe(false);
  });

  it('creates a product from UAH-only admin pricing while keeping the legacy USD mirror explicit', async () => {
    const created = await createProduct({
      title: 'UAH-only create product',
      slug: uniqueSlug('admin-create-uah-only'),
      description: null,
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 4,
      prices: [{ currency: 'UAH', priceMinor: 5100, originalPriceMinor: null }],
      image: new File([new Uint8Array([1, 2, 3, 4])], 'create-uah-only.png', {
        type: 'image/png',
      }),
    } as any);

    createdProductIds.push(created.id);

    const [legacy] = await db
      .select({
        price: products.price,
        originalPrice: products.originalPrice,
        currency: products.currency,
      })
      .from(products)
      .where(eq(products.id, created.id))
      .limit(1);

    const [uah] = await db
      .select({
        priceMinor: productPrices.priceMinor,
        originalPriceMinor: productPrices.originalPriceMinor,
      })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, created.id),
          eq(productPrices.currency, 'UAH')
        )
      )
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

    expect(legacy.currency).toBe('USD');
    expect(String(legacy.price)).toBe(String(toDbMoney(5100)));
    expect(legacy.originalPrice).toBeNull();
    expect(uah?.priceMinor).toBe(5100);
    expect(uah?.originalPriceMinor).toBeNull();
    expect(usd).toBeUndefined();
  });

  it('rejects USD-only admin pricing at create-time even through the service layer', async () => {
    expect.assertions(3);

    try {
      await createProduct({
        title: 'USD-only create product',
        slug: uniqueSlug('admin-create-usd-only'),
        description: null,
        badge: 'NONE',
        isActive: true,
        isFeatured: false,
        stock: 4,
        prices: [
          { currency: 'USD', priceMinor: 5100, originalPriceMinor: null },
        ],
        image: new File([new Uint8Array([1, 2, 3, 4])], 'create-usd-only.png', {
          type: 'image/png',
        }),
      } as any);
      throw new Error('Expected createProduct to throw PriceConfigError');
    } catch (error) {
      expect(error).toBeInstanceOf(PriceConfigError);
      expect((error as PriceConfigError).code).toBe('PRICE_CONFIG_ERROR');
      expect((error as PriceConfigError & { currency?: string }).currency).toBe(
        'UAH'
      );
    }
  });
});
