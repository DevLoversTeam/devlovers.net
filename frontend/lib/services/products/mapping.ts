import { fromCents, fromDbMoney } from '@/lib/shop/money';
import type { DbProduct } from '@/lib/types/shop';

import { getProductImagesByProductIds, resolveProductImages } from './images';
import type { ProductRow } from './types';

function mapRowToProductWithResolvedImages(
  row: ProductRow,
  resolvedImages: ReturnType<typeof resolveProductImages>
): DbProduct {
  const priceCents = fromDbMoney(row.price);
  const originalPriceCents =
    row.originalPrice == null ? undefined : fromDbMoney(row.originalPrice);

  return {
    ...row,
    description: row.description ?? undefined,
    imageUrl: resolvedImages.imageUrl,
    imagePublicId: resolvedImages.imagePublicId ?? undefined,
    price: fromCents(priceCents),
    originalPrice:
      originalPriceCents == null ? undefined : fromCents(originalPriceCents),
    images: resolvedImages.images,
    primaryImage: resolvedImages.primaryImage,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    type: row.type ?? undefined,
  };
}

export async function mapRowToProduct(row: ProductRow): Promise<DbProduct> {
  const imagesByProductId = await getProductImagesByProductIds([row.id]);
  return mapRowToProductWithResolvedImages(
    row,
    resolveProductImages(row, imagesByProductId.get(row.id))
  );
}

export async function mapRowsToProducts(
  rows: ProductRow[]
): Promise<DbProduct[]> {
  if (rows.length === 0) return [];

  const imagesByProductId = await getProductImagesByProductIds(
    rows.map(row => row.id)
  );

  return rows.map(row =>
    mapRowToProductWithResolvedImages(
      row,
      resolveProductImages(row, imagesByProductId.get(row.id))
    )
  );
}
