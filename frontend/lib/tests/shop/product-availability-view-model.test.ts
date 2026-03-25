import { describe, expect, it } from 'vitest';

import { getStorefrontAvailabilityState } from '@/lib/shop/availability';
import type { ShopProduct } from '@/lib/validation/shop';

function makeProduct(overrides?: Partial<ShopProduct>): ShopProduct {
  return {
    id: 'product-1',
    slug: 'product-1',
    name: 'Product 1',
    price: 5000,
    currency: 'USD',
    image: 'https://example.com/primary.png',
    images: [],
    primaryImage: undefined,
    originalPrice: undefined,
    createdAt: undefined,
    category: undefined,
    type: undefined,
    colors: [],
    sizes: [],
    description: undefined,
    badge: 'NONE',
    inStock: true,
    ...overrides,
  };
}

describe('product availability view model', () => {
  it('maps purchasable products to available-to-order', () => {
    expect(getStorefrontAvailabilityState(makeProduct())).toBe(
      'available_to_order'
    );
  });

  it('maps public products with no stock to out-of-stock messaging', () => {
    expect(
      getStorefrontAvailabilityState(makeProduct({ inStock: false }))
    ).toBe('out_of_stock');
  });

  it('maps non-purchasable PDP products to locale-currency unavailable messaging', () => {
    expect(getStorefrontAvailabilityState(null)).toBe(
      'unavailable_in_locale_currency'
    );
  });
});
