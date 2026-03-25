import { describe, expect, it } from 'vitest';

import {
  getProductGalleryImages,
  toProductPageViewModel,
} from '@/lib/shop/data';

describe('product gallery view model', () => {
  it('renders the explicit primary image first while preserving the remaining image order', () => {
    const gallery = getProductGalleryImages({
      image: 'https://example.com/legacy.png',
      primaryImage: {
        id: 'img-primary',
        url: 'https://example.com/primary.png',
        publicId: 'products/primary',
        sortOrder: 20,
        isPrimary: true,
      },
      images: [
        {
          id: 'img-secondary',
          url: 'https://example.com/secondary.png',
          publicId: 'products/secondary',
          sortOrder: 10,
          isPrimary: false,
        },
        {
          id: 'img-primary',
          url: 'https://example.com/primary.png',
          publicId: 'products/primary',
          sortOrder: 20,
          isPrimary: true,
        },
        {
          id: 'img-third',
          url: 'https://example.com/third.png',
          publicId: 'products/third',
          sortOrder: 30,
          isPrimary: false,
        },
      ],
    });

    expect(gallery.map(image => image.id)).toEqual([
      'img-primary',
      'img-secondary',
      'img-third',
    ]);
  });

  it('falls back to the legacy single-image field when no explicit gallery exists', () => {
    const gallery = getProductGalleryImages({
      image: 'https://example.com/legacy.png',
      images: [],
      primaryImage: undefined,
    });

    expect(gallery).toEqual([
      {
        id: 'fallback:primary',
        url: 'https://example.com/legacy.png',
        publicId: undefined,
        sortOrder: 0,
        isPrimary: true,
      },
    ]);
  });

  it('falls back to the placeholder image when gallery and legacy image data are missing', () => {
    const gallery = getProductGalleryImages({
      image: '',
      images: [],
      primaryImage: undefined,
    });

    expect(gallery).toEqual([
      {
        id: 'fallback:primary',
        url: '/placeholder.svg',
        publicId: undefined,
        sortOrder: 0,
        isPrimary: true,
      },
    ]);
  });

  it('normalizes PDP display and commerce data into separate concrete branches', () => {
    const viewModel = toProductPageViewModel({
      kind: 'available',
      product: {
        id: 'product-1',
        slug: 'product-1',
        name: 'Product 1',
        image: 'https://example.com/primary.png',
        images: [
          {
            id: 'img-primary',
            url: 'https://example.com/primary.png',
            publicId: 'products/primary',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
        primaryImage: {
          id: 'img-primary',
          url: 'https://example.com/primary.png',
          publicId: 'products/primary',
          sortOrder: 0,
          isPrimary: true,
        },
        description: 'desc',
        badge: 'SALE',
      },
      commerceProduct: {
        id: 'product-1',
        slug: 'product-1',
        name: 'Product 1',
        price: 5000,
        currency: 'USD',
        image: 'https://example.com/primary.png',
        images: [
          {
            id: 'img-primary',
            url: 'https://example.com/primary.png',
            publicId: 'products/primary',
            sortOrder: 0,
            isPrimary: true,
          },
        ],
        primaryImage: {
          id: 'img-primary',
          url: 'https://example.com/primary.png',
          publicId: 'products/primary',
          sortOrder: 0,
          isPrimary: true,
        },
        originalPrice: 6500,
        colors: ['black'],
        sizes: ['L'],
        description: 'desc',
        badge: 'SALE',
        inStock: true,
      },
    });

    expect(viewModel.kind).toBe('available');
    if (viewModel.kind !== 'available') {
      throw new Error('Expected available product page data');
    }

    expect(viewModel.product.name).toBe('Product 1');
    expect(viewModel.commerceProduct.price).toBe(5000);
    expect(viewModel.commerceProduct.currency).toBe('USD');
  });
});
