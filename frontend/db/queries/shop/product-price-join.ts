import { and, eq } from 'drizzle-orm';

import { productPrices, products } from '@/db/schema';
import type { CurrencyCode } from '@/lib/shop/currency';

export function productPriceJoin(currency: CurrencyCode) {
  return and(
    eq(productPrices.productId, products.id),
    eq(productPrices.currency, currency)
  );
}
