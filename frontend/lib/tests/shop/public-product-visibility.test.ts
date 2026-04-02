import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { getPublicProductBySlug } from '@/db/queries/shop/products';
import { productPrices, products } from '@/db/schema';
import { getProductPageData } from '@/lib/shop/data';

function logTestCleanupFailed(meta: Record<string, unknown>, error: unknown) {
  console.error('[test cleanup failed]', {
    file: 'public-product-visibility.test.ts',
    ...meta,
    error,
  });
}

async function cleanup(productId: string) {
  try {
    await db
      .delete(productPrices)
      .where(eq(productPrices.productId, productId));
  } catch (e) {
    logTestCleanupFailed({ step: 'delete productPrices', productId }, e);
  }

  try {
    await db.delete(products).where(eq(products.id, productId));
  } catch (e) {
    logTestCleanupFailed({ step: 'delete product', productId }, e);
  }
}

describe('P0-5 Public products: inactive not visible', () => {
  it('inactive slug -> 404 (selector returns null)', async () => {
    const productId = randomUUID();
    const slug = `inactive-${randomUUID()}`;

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: 'Inactive product',
        description: null,
        imageUrl: 'https://placehold.co/600x600',
        imagePublicId: null,
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: 'NONE',
        isActive: false,
        isFeatured: false,
        stock: 5,
        sku: null,

        price: '10.00',
        originalPrice: null,
        currency: 'USD',
      });

      await db.insert(productPrices).values({
        id: randomUUID(),
        productId,
        currency: 'USD',

        priceMinor: 1000,
        originalPriceMinor: null,
        price: '10.00',
        originalPrice: null,
      });

      const result = await getPublicProductBySlug(slug, 'USD');
      expect(result).toBeNull();
    } finally {
      await cleanup(productId);
    }
  });

  it('active slug -> 200 (selector returns product)', async () => {
    const productId = randomUUID();
    const slug = `active-${randomUUID()}`;

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: 'Active product',
        description: null,
        imageUrl: 'https://placehold.co/600x600',
        imagePublicId: null,
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: 'NONE',
        isActive: true,
        isFeatured: false,
        stock: 5,
        sku: null,

        price: '19.99',
        originalPrice: null,
        currency: 'USD',
      });

      await db.insert(productPrices).values({
        id: randomUUID(),
        productId,
        currency: 'USD',

        priceMinor: 1999,
        originalPriceMinor: null,
        price: '19.99',
        originalPrice: null,
      });

      const result = await getPublicProductBySlug(slug, 'USD');
      expect(result).not.toBeNull();
      expect(result!.slug).toBe(slug);
      expect(result!.currency).toBe('USD');
    } finally {
      await cleanup(productId);
    }
  });

  it('keeps PDP product visibility on non-uk locales when only the UAH price row exists', async () => {
    const productId = randomUUID();
    const slug = `uah-only-${randomUUID()}`;

    try {
      await db.insert(products).values({
        id: productId,
        slug,
        title: 'UAH-only product',
        description: null,
        imageUrl: 'https://placehold.co/600x600',
        imagePublicId: null,
        category: null,
        type: null,
        colors: [],
        sizes: [],
        badge: 'NONE',
        isActive: true,
        isFeatured: false,
        stock: 5,
        sku: null,

        price: '10.00',
        originalPrice: null,
        currency: 'USD',
      });

      await db.insert(productPrices).values({
        id: randomUUID(),
        productId,
        currency: 'UAH',
        priceMinor: 4400,
        originalPriceMinor: null,
        price: '44.00',
        originalPrice: null,
      });

      const result = await getProductPageData(slug, 'en');

      expect(result.kind).toBe('available');
      if (result.kind !== 'available') {
        throw new Error('Expected PDP data to stay available for UAH-only row');
      }

      expect(result.commerceProduct.slug).toBe(slug);
      expect(result.commerceProduct.currency).toBe('UAH');
      expect(result.commerceProduct.price).toBe(4400);
    } finally {
      await cleanup(productId);
    }
  });
});
