import { and, eq, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import type { CurrencyCode } from '@/lib/shop/currency';
import type { DbProduct } from '@/lib/types/shop';

import { assertMoneyMinorInt } from '../prices';
import { mapRowToProduct } from '../mapping';
import type { AdminProductPriceRow, AdminProductsFilter } from '../types';

export async function getAdminProductById(id: string): Promise<DbProduct> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  return mapRowToProduct(row);
}


export async function getAdminProductPrices(
  productId: string
): Promise<AdminProductPriceRow[]> {
  const rows = await db
    .select({
      currency: productPrices.currency,
      // canonical:
      priceMinor: productPrices.priceMinor,
      originalPriceMinor: productPrices.originalPriceMinor,
      // legacy (keep during rollout):
      price: productPrices.price,
      originalPrice: productPrices.originalPrice,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, productId));

  // Guard: drizzle int columns should come as number, but never trust the driver implicitly.
  return rows.map(r => ({
    currency: r.currency as CurrencyCode,
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
