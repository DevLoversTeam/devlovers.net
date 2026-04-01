import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getHomepageContentMock = vi.hoisted(() => vi.fn());
const getCatalogProductsMock = vi.hoisted(() => vi.fn());
const getProductPageDataMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
const getMessagesMock = vi.hoisted(() => vi.fn(async () => ({ shop: {} })));
const resolveStripeCheckoutEnabledMock = vi.hoisted(() => vi.fn(() => true));
const resolveMonobankCheckoutEnabledMock = vi.hoisted(() => vi.fn(() => false));
const resolveMonobankGooglePayEnabledMock = vi.hoisted(() =>
  vi.fn(() => false)
);
const getShopLegalVersionsMock = vi.hoisted(() =>
  vi.fn(() => ({
    termsVersion: 'terms-v1',
    privacyVersion: 'privacy-v1',
  }))
);
const cartPageClientMock = vi.hoisted(() =>
  vi.fn(() => createElement('div', null, 'cart-page-client'))
);

vi.mock('next-intl/server', () => ({
  getMessages: getMessagesMock,
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href?: string }) =>
    createElement('a', { href }, children),
  redirect: redirectMock,
}));

vi.mock('@/lib/shop/data', () => ({
  getHomepageContent: getHomepageContentMock,
  getCatalogProducts: getCatalogProductsMock,
  getProductGalleryImages: vi.fn(
    (product: { images?: Array<unknown> }) => product.images ?? []
  ),
  getProductPageData: getProductPageDataMock,
}));

vi.mock('@/lib/shop/availability', () => ({
  getStorefrontAvailabilityState: vi.fn(() => 'available_to_order'),
}));

vi.mock('@/lib/shop/currency', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/shop/currency')>();

  return {
    ...actual,
    formatMoney: vi.fn(() => '$49.99'),
  };
});

vi.mock('@/lib/shop/size-guide', () => ({
  getApparelSizeGuideForProduct: vi.fn(() => null),
}));

vi.mock('@/components/shop/CategoryTile', () => ({
  CategoryTile: ({
    category,
  }: {
    category: {
      name: string;
    };
  }) => createElement('div', null, category.name),
}));

vi.mock('@/components/shop/ProductCard', () => ({
  ProductCard: ({
    product,
  }: {
    product: {
      name: string;
    };
  }) => createElement('div', null, product.name),
}));

vi.mock('@/components/shop/ShopHero', () => ({
  Hero: ({
    headline,
    subheadline,
    ctaText,
  }: {
    headline: string;
    subheadline: string;
    ctaText: string;
  }) =>
    createElement(
      'section',
      null,
      createElement('h1', null, headline),
      createElement('p', null, subheadline),
      createElement('span', null, ctaText)
    ),
}));

vi.mock('@/components/shop/CatalogProductsClient', () => ({
  CatalogProductsClient: ({
    initialCatalog,
  }: {
    initialCatalog: {
      products: Array<{ name: string }>;
    };
  }) =>
    createElement(
      'div',
      null,
      ...initialCatalog.products.map(product =>
        createElement('span', { key: product.name }, product.name)
      )
    ),
}));

vi.mock('@/components/shop/ProductFilters', () => ({
  ProductFilters: () => createElement('div', null, 'filters'),
}));

vi.mock('@/components/shop/ProductsToolbar', () => ({
  ProductsToolbar: () => createElement('div', null, 'toolbar'),
}));

vi.mock('@/components/shop/AddToCartButton', () => ({
  AddToCartButton: () =>
    createElement('button', { type: 'button' }, 'add to cart'),
}));

vi.mock('@/components/shop/ProductGallery', () => ({
  ProductGallery: ({ productName }: { productName: string }) =>
    createElement('div', null, productName),
}));

vi.mock('@/lib/env/shop-legal', () => ({
  getShopLegalVersions: getShopLegalVersionsMock,
}));

vi.mock('@/app/[locale]/shop/cart/capabilities', () => ({
  resolveMonobankCheckoutEnabled: resolveMonobankCheckoutEnabledMock,
  resolveMonobankGooglePayEnabled: resolveMonobankGooglePayEnabledMock,
  resolveStripeCheckoutEnabled: resolveStripeCheckoutEnabledMock,
}));

vi.mock('@/app/[locale]/shop/cart/CartPageClient', () => ({
  default: cartPageClientMock,
}));

describe('public shop runtime/cache smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    getMessagesMock.mockResolvedValue({ shop: {} });
    getHomepageContentMock.mockResolvedValue({
      newArrivals: [
        {
          id: 'prod-home-1',
          name: 'DevLovers Hoodie',
        },
      ],
      categories: [
        {
          id: 'cat-home-1',
          name: 'Hoodies',
          slug: 'hoodies',
          image: '/hoodies.jpg',
        },
      ],
    });
    getCatalogProductsMock.mockResolvedValue({
      products: [
        {
          id: 'prod-catalog-1',
          name: 'DevLovers Mug',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 24,
      hasMore: false,
    });
    getProductPageDataMock.mockResolvedValue({
      kind: 'available',
      product: {
        id: 'prod-pdp-1',
        slug: 'devlovers-mug',
        name: 'DevLovers Mug',
        image: '/mug.jpg',
        images: [
          {
            id: 'img-pdp-1',
            url: '/mug.jpg',
            publicId: null,
            sortOrder: 0,
            isPrimary: true,
          },
        ],
        badge: 'NONE',
        description: 'A mug for engineers.',
      },
      commerceProduct: {
        id: 'prod-pdp-1',
        slug: 'devlovers-mug',
        name: 'DevLovers Mug',
        price: 4999,
        currency: 'USD',
        image: '/mug.jpg',
        images: [
          {
            id: 'img-pdp-1',
            url: '/mug.jpg',
            publicId: null,
            sortOrder: 0,
            isPrimary: true,
          },
        ],
        badge: 'NONE',
        inStock: true,
      },
    });
  });

  it('keeps the shop landing page on explicit node runtime and dynamic cache posture while rendering storefront data', async () => {
    const mod = await import('@/app/[locale]/shop/page');
    const html = renderToStaticMarkup(
      await mod.default({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
    expect(getHomepageContentMock).toHaveBeenCalledWith('en');
    expect(html).toContain('DevLovers Hoodie');
    expect(html).toContain('Hoodies');
  });

  it('keeps the products listing on explicit node runtime and dynamic cache posture while resolving catalog filters', async () => {
    const mod = await import('@/app/[locale]/shop/products/page');
    const html = renderToStaticMarkup(
      await mod.default({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ page: '1', sort: 'newest' }),
      })
    );

    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
    expect(redirectMock).not.toHaveBeenCalled();
    expect(getCatalogProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: expect.any(Number),
        sort: 'newest',
      }),
      'en'
    );
    expect(html).toContain('DevLovers Mug');
  });

  it('keeps the product detail page on explicit node runtime and dynamic cache posture while resolving the requested slug', async () => {
    const mod = await import('@/app/[locale]/shop/products/[slug]/page');
    const html = renderToStaticMarkup(
      await mod.default({
        params: Promise.resolve({ locale: 'en', slug: 'devlovers-mug' }),
      })
    );

    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
    expect(getProductPageDataMock).toHaveBeenCalledWith('devlovers-mug', 'en');
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(html).toContain('DevLovers Mug');
    expect(html).toContain('add to cart');
  });

  it('keeps the cart page on explicit node runtime and dynamic cache posture while resolving server-side checkout capabilities', async () => {
    const mod = await import('@/app/[locale]/shop/cart/page');
    const html = renderToStaticMarkup(mod.default());

    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
    expect(html).toContain('cart-page-client');
    expect(getShopLegalVersionsMock).toHaveBeenCalledTimes(1);
    expect(resolveStripeCheckoutEnabledMock).toHaveBeenCalledTimes(1);
    expect(resolveMonobankCheckoutEnabledMock).toHaveBeenCalledTimes(1);
    expect(resolveMonobankGooglePayEnabledMock).toHaveBeenCalledTimes(1);
    expect(cartPageClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeEnabled: true,
        monobankEnabled: false,
        monobankGooglePayEnabled: false,
        termsVersion: 'terms-v1',
        privacyVersion: 'privacy-v1',
      }),
      undefined
    );
  });
});
