import { beforeEach, describe, expect, it, vi } from 'vitest';

const shopQueryMocks = vi.hoisted(() => ({
  getPublicProductBySlug: vi.fn(),
  getPublicProductBaseBySlug: vi.fn(),
  getActiveProductsPage: vi.fn(),
}));

vi.mock('@/db/queries/shop/products', () => shopQueryMocks);

import { getCatalogProducts, getProductPageData } from '@/lib/shop/data';

function makeDbProduct(overrides?: Record<string, unknown>) {
  const createdAt = new Date('2026-03-01T00:00:00.000Z');

  return {
    id: 'product-1',
    slug: 'product-1',
    title: 'Product 1',
    description: null,
    imageUrl: '/placeholder.svg',
    imagePublicId: null,
    price: '44.00',
    originalPrice: null,
    currency: 'UAH' as const,
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
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

describe('public storefront read policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the standard storefront UAH currency for catalog reads on every locale', async () => {
    shopQueryMocks.getActiveProductsPage.mockResolvedValue({
      items: [makeDbProduct()],
      total: 1,
    });

    for (const locale of ['uk', 'en', 'pl']) {
      await getCatalogProducts(
        { category: 'all', sort: 'newest', page: 1, limit: 24 },
        locale
      );
    }

    expect(shopQueryMocks.getActiveProductsPage).toHaveBeenNthCalledWith(1, {
      currency: 'UAH',
      limit: 24,
      offset: 0,
      category: undefined,
      type: undefined,
      color: undefined,
      size: undefined,
      sort: 'newest',
    });
    expect(shopQueryMocks.getActiveProductsPage).toHaveBeenNthCalledWith(2, {
      currency: 'UAH',
      limit: 24,
      offset: 0,
      category: undefined,
      type: undefined,
      color: undefined,
      size: undefined,
      sort: 'newest',
    });
    expect(shopQueryMocks.getActiveProductsPage).toHaveBeenNthCalledWith(3, {
      currency: 'UAH',
      limit: 24,
      offset: 0,
      category: undefined,
      type: undefined,
      color: undefined,
      size: undefined,
      sort: 'newest',
    });
  });

  it('uses the standard storefront UAH currency for PDP reads on non-uk locales', async () => {
    shopQueryMocks.getPublicProductBySlug.mockResolvedValueOnce(
      makeDbProduct({ slug: 'policy-product' })
    );

    const result = await getProductPageData('policy-product', 'en');

    expect(shopQueryMocks.getPublicProductBySlug).toHaveBeenCalledWith(
      'policy-product',
      'UAH'
    );
    expect(result.kind).toBe('available');
  });
});
