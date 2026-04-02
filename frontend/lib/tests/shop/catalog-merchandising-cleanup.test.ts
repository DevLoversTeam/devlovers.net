import { describe, expect, it, vi } from 'vitest';

const shopQueryMocks = vi.hoisted(() => ({
  getPublicProductBySlug: vi.fn(),
  getPublicProductBaseBySlug: vi.fn(),
  getActiveProductsPage: vi.fn(),
}));

vi.mock('@/db/queries/shop/products', () => shopQueryMocks);

import { STOREFRONT_CATEGORIES } from '@/lib/config/catalog';
import { canonicalizePublicCatalogQuery } from '@/lib/shop/catalog-query';
import { getHomepageContent } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';

function makeDbProduct(input: {
  id: string;
  slug: string;
  title: string;
  createdAt: Date;
}) {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    description: null,
    imageUrl: '/placeholder.svg',
    imagePublicId: null,
    price: '19.99',
    originalPrice: null,
    currency: 'USD' as const,
    isActive: true,
    isFeatured: false,
    stock: 5,
    sku: null,
    category: 'apparel' as const,
    type: 'shirts' as const,
    colors: ['black'] as const,
    sizes: ['M'] as const,
    badge: 'NONE' as const,
    images: [],
    primaryImage: undefined,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

describe('catalog merchandising cleanup', () => {
  it('removes pseudo categories from customer-facing category surfaces', () => {
    expect(STOREFRONT_CATEGORIES.map(category => category.slug)).not.toContain(
      'best-sellers'
    );
    expect(STOREFRONT_CATEGORIES.map(category => category.slug)).not.toContain(
      'new-arrivals'
    );

    expect(
      catalogQuerySchema.safeParse({ category: 'best-sellers' }).success
    ).toBe(false);
    expect(
      catalogQuerySchema.safeParse({ category: 'new-arrivals' }).success
    ).toBe(false);
    expect(catalogQuerySchema.safeParse({ category: 'apparel' }).success).toBe(
      true
    );
  });

  it('canonicalizes legacy new-arrivals links to the newest sort', () => {
    expect(
      canonicalizePublicCatalogQuery({ category: 'new-arrivals' })
    ).toEqual({
      needsCanonical: true,
      params: expect.any(URLSearchParams),
      normalized: { sort: 'newest' },
    });

    expect(canonicalizePublicCatalogQuery({ filter: 'new' })).toEqual({
      needsCanonical: true,
      params: expect.any(URLSearchParams),
      normalized: { sort: 'newest' },
    });

    expect(
      canonicalizePublicCatalogQuery({
        category: 'new-arrivals',
        sort: 'price-asc',
        page: '2',
      })
    ).toEqual({
      needsCanonical: true,
      params: expect.any(URLSearchParams),
      normalized: {
        sort: 'newest',
        page: '2',
      },
    });
  });

  it('builds homepage new arrivals from newest catalog results', async () => {
    const newestRows = [
      makeDbProduct({
        id: 'product-5',
        slug: 'product-5',
        title: 'Product 5',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
      }),
      makeDbProduct({
        id: 'product-4',
        slug: 'product-4',
        title: 'Product 4',
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
      }),
      makeDbProduct({
        id: 'product-3',
        slug: 'product-3',
        title: 'Product 3',
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
      }),
      makeDbProduct({
        id: 'product-2',
        slug: 'product-2',
        title: 'Product 2',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      }),
      makeDbProduct({
        id: 'product-1',
        slug: 'product-1',
        title: 'Product 1',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ];

    shopQueryMocks.getActiveProductsPage.mockResolvedValueOnce({
      items: newestRows,
      total: newestRows.length,
    });

    const content = await getHomepageContent('en');

    expect(shopQueryMocks.getActiveProductsPage).toHaveBeenCalledWith({
      currency: 'UAH',
      limit: 12,
      offset: 0,
      category: undefined,
      type: undefined,
      color: undefined,
      size: undefined,
      sort: 'newest',
    });

    expect(content.newArrivals.map(product => product.slug)).toEqual([
      'product-5',
      'product-4',
      'product-3',
      'product-2',
    ]);
  });
});
