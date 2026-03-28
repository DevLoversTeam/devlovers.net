import type { ShopProduct } from '@/lib/validation/shop';

export type StorefrontAvailabilityState =
  | 'available_to_order'
  | 'out_of_stock'
  | 'unavailable_in_locale_currency';

type StorefrontAvailabilityProduct = Pick<ShopProduct, 'inStock'>;

export function getStorefrontAvailabilityState(
  product: StorefrontAvailabilityProduct | null
): StorefrontAvailabilityState {
  if (product === null) {
    return 'unavailable_in_locale_currency';
  }

  return product.inStock ? 'available_to_order' : 'out_of_stock';
}
