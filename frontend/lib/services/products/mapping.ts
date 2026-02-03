import { fromCents, fromDbMoney } from '@/lib/shop/money';
import type { DbProduct } from '@/lib/types/shop';

import type { ProductRow } from './types';

export function mapRowToProduct(row: ProductRow): DbProduct {
  const priceCents = fromDbMoney(row.price);
  const originalPriceCents =
    row.originalPrice == null ? undefined : fromDbMoney(row.originalPrice);

  return {
    ...row,
    description: row.description ?? undefined,
    price: fromCents(priceCents),
    originalPrice:
      originalPriceCents == null ? undefined : fromCents(originalPriceCents),
    imagePublicId: row.imagePublicId ?? undefined,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    type: row.type ?? undefined,
  };
}
