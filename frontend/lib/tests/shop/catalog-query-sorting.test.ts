import { randomUUID } from 'node:crypto';

import { inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { getActiveProductsPage } from '@/db/queries/shop/products';
import { productPrices, products } from '@/db/schema';

const createdProductIds: string[] = [];

async function insertCatalogProduct(input: {
  slug: string;
  title: string;
  createdAt: Date;
  isFeatured: boolean;
  priceMinor: number;
}) {
  const productId = randomUUID();
  createdProductIds.push(productId);

  await db.insert(products).values({
    id: productId,
    slug: input.slug,
    title: input.title,
    description: null,
    imageUrl: 'https://placehold.co/600x600',
    imagePublicId: null,
    category: 'apparel',
    type: 'shirts',
    colors: ['black'],
    sizes: ['M'],
    badge: 'NONE',
    isActive: true,
    isFeatured: input.isFeatured,
    stock: 10,
    sku: null,
    price: (input.priceMinor / 100).toFixed(2),
    originalPrice: null,
    currency: 'USD',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });

  await db.insert(productPrices).values({
    id: randomUUID(),
    productId,
    currency: 'USD',
    priceMinor: input.priceMinor,
    originalPriceMinor: null,
    price: (input.priceMinor / 100).toFixed(2),
    originalPrice: null,
  });

  return productId;
}

afterEach(async () => {
  if (createdProductIds.length === 0) return;

  const ids = [...createdProductIds];
  createdProductIds.length = 0;

  await db.delete(productPrices).where(inArray(productPrices.productId, ids));
  await db.delete(products).where(inArray(products.id, ids));
});

describe.sequential('catalog query sorting', () => {
  it('defaults to featured-first ordering with deterministic recency fallback', async () => {
    const suffix = randomUUID().slice(0, 8);

    await insertCatalogProduct({
      slug: `catalog-featured-old-${suffix}`,
      title: 'Featured old',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      isFeatured: true,
      priceMinor: 2000,
    });
    await insertCatalogProduct({
      slug: `catalog-regular-new-${suffix}`,
      title: 'Regular new',
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
      isFeatured: false,
      priceMinor: 1500,
    });
    await insertCatalogProduct({
      slug: `catalog-featured-new-${suffix}`,
      title: 'Featured new',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      isFeatured: true,
      priceMinor: 1800,
    });

    const result = await getActiveProductsPage({
      currency: 'USD',
      limit: 20,
      offset: 0,
    });

    const relevant = result.items
      .filter(item => item.slug.endsWith(suffix))
      .map(item => item.slug);

    expect(relevant).toEqual([
      `catalog-featured-new-${suffix}`,
      `catalog-featured-old-${suffix}`,
      `catalog-regular-new-${suffix}`,
    ]);
  });

  it('keeps newest sorting authoritative when explicitly requested', async () => {
    const suffix = randomUUID().slice(0, 8);

    await insertCatalogProduct({
      slug: `catalog-newest-featured-old-${suffix}`,
      title: 'Newest featured old',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      isFeatured: true,
      priceMinor: 2000,
    });
    await insertCatalogProduct({
      slug: `catalog-newest-regular-new-${suffix}`,
      title: 'Newest regular new',
      createdAt: new Date('2026-03-03T00:00:00.000Z'),
      isFeatured: false,
      priceMinor: 1500,
    });

    const result = await getActiveProductsPage({
      currency: 'USD',
      limit: 20,
      offset: 0,
      sort: 'newest',
    });

    const relevant = result.items
      .filter(item => item.slug.endsWith(suffix))
      .map(item => item.slug);

    expect(relevant).toEqual([
      `catalog-newest-regular-new-${suffix}`,
      `catalog-newest-featured-old-${suffix}`,
    ]);
  });
});
