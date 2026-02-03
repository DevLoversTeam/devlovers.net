import { and, eq, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import { ProductNotFoundError } from '@/lib/errors/products';
import type { CurrencyCode } from '@/lib/shop/currency';
import type { DbProduct } from '@/lib/types/shop';

import { mapRowToProduct } from '../mapping';
import { assertMoneyMinorInt } from '../prices';
import type { AdminProductPriceRow, AdminProductsFilter } from '../types';

export async function getAdminProductById(id: string): Promise<DbProduct> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) {
    throw new ProductNotFoundError(id);
  }

  return mapRowToProduct(row);
}

export async function getAdminProductPrices(
  productId: string
): Promise<AdminProductPriceRow[]> {
  const rows = await db
    .select({
      currency: productPrices.currency,

      priceMinor: productPrices.priceMinor,
      originalPriceMinor: productPrices.originalPriceMinor,

      price: productPrices.price,
      originalPrice: productPrices.originalPrice,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, productId));

  return rows.map(r => ({
    currency: r.currency as CurrencyCode,
    // Defensive: some DB drivers return NUMERIC/DECIMAL as string/unknown at runtime; enforce safe integer minor-units here.
    priceMinor: assertMoneyMinorInt(
      r.priceMinor,
      `${String(r.currency)} priceMinor`
    ),
    originalPriceMinor:
      r.originalPriceMinor == null
        ? null
        : assertMoneyMinorInt(
            r.originalPriceMinor,
            `${String(r.currency)} originalPriceMinor`
          ),
    price: String(r.price),
    originalPrice: r.originalPrice == null ? null : String(r.originalPrice),
  }));
}

export async function getAdminProductByIdWithPrices(id: string): Promise<
  DbProduct & {
    prices: AdminProductPriceRow[];
  }
> {
  const product = await getAdminProductById(id);
  const prices = await getAdminProductPrices(id);
  return { ...product, prices };
}

export async function getAdminProductsList(
  filters: AdminProductsFilter = {}
): Promise<DbProduct[]> {
  const conditions: SQL[] = [];

  if (typeof filters.isActive === 'boolean') {
    conditions.push(eq(products.isActive, filters.isActive));
  }
  if (filters.category) {
    conditions.push(eq(products.category, filters.category));
  }
  if (filters.type) {
    conditions.push(eq(products.type, filters.type));
  }

  const rows = await db
    .select()
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined);

  return rows.map(mapRowToProduct);
}
