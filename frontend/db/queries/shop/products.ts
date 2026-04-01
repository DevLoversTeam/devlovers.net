import { and, asc, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { db } from '@/db';
import { productPrices, products } from '@/db/schema';
import type { CatalogSort } from '@/lib/config/catalog';
import {
  getProductImagesByProductIds,
  resolveProductImages,
} from '@/lib/services/products/images';
import type { CurrencyCode } from '@/lib/shop/currency';
import { type DbProduct, dbProductSchema } from '@/lib/validation/shop';

const publicProductBaseSelect = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  description: products.description,
  imageUrl: products.imageUrl,
  imagePublicId: products.imagePublicId,
  category: products.category,
  type: products.type,
  colors: products.colors,
  sizes: products.sizes,
  badge: products.badge,
  isActive: products.isActive,
  isFeatured: products.isFeatured,
  stock: products.stock,
  sku: products.sku,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
} as const;

export type PublicProductBaseRow = Pick<
  typeof products.$inferSelect,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'imageUrl'
  | 'imagePublicId'
  | 'category'
  | 'type'
  | 'colors'
  | 'sizes'
  | 'badge'
  | 'isActive'
  | 'isFeatured'
  | 'stock'
  | 'sku'
  | 'createdAt'
  | 'updatedAt'
>;

type PublicProductBaseResolvedRow = Omit<
  PublicProductBaseRow,
  'imageUrl' | 'imagePublicId'
> &
  ReturnType<typeof resolveProductImages>;

export async function getPublicProductBaseBySlug(
  slug: string
): Promise<PublicProductBaseResolvedRow | null> {
  const rows = await db
    .select(publicProductBaseSelect)
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const imagesByProductId = await getProductImagesByProductIds([row.id]);
  const resolvedImages = resolveProductImages(
    row,
    imagesByProductId.get(row.id)
  );

  return {
    ...row,
    imageUrl: resolvedImages.imageUrl,
    imagePublicId: resolvedImages.imagePublicId,
    images: resolvedImages.images,
    primaryImage: resolvedImages.primaryImage,
  };
}

const publicProductSelect = {
  id: products.id,
  slug: products.slug,
  title: products.title,
  description: products.description,
  imageUrl: products.imageUrl,
  imagePublicId: products.imagePublicId,
  category: products.category,
  type: products.type,
  colors: products.colors,
  sizes: products.sizes,
  badge: products.badge,
  isActive: products.isActive,
  isFeatured: products.isFeatured,
  stock: products.stock,
  sku: products.sku,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,

  price: productPrices.price,
  originalPrice: productPrices.originalPrice,
  currency: productPrices.currency,
} as const;

type PublicProductRow = Pick<
  typeof products.$inferSelect,
  | 'id'
  | 'slug'
  | 'title'
  | 'description'
  | 'imageUrl'
  | 'imagePublicId'
  | 'category'
  | 'type'
  | 'colors'
  | 'sizes'
  | 'badge'
  | 'isActive'
  | 'isFeatured'
  | 'stock'
  | 'sku'
  | 'createdAt'
  | 'updatedAt'
> & {
  price: string;
  originalPrice: string | null;
  currency: CurrencyCode;
};

function mapRowToDbProduct(
  row: PublicProductRow,
  imagesByProductId?: Map<
    string,
    ReturnType<typeof resolveProductImages>['images']
  >
): DbProduct {
  const resolvedImages = resolveProductImages(
    row,
    imagesByProductId?.get(row.id)
  );

  return dbProductSchema.parse({
    ...row,
    imageUrl: resolvedImages.imageUrl,
    imagePublicId: resolvedImages.imagePublicId,
    images: resolvedImages.images,
    primaryImage: resolvedImages.primaryImage,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
  });
}

async function mapRowsToDbProducts(
  rows: PublicProductRow[]
): Promise<DbProduct[]> {
  if (rows.length === 0) return [];

  const imagesByProductId = await getProductImagesByProductIds(
    rows.map(row => row.id)
  );

  return rows.map(row => mapRowToDbProduct(row, imagesByProductId));
}

function priceJoin(currency: CurrencyCode) {
  return and(
    eq(productPrices.productId, products.id),
    eq(productPrices.currency, currency)
  );
}

function buildWhereClause(options: {
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  slugs?: string[];
}): SQL {
  const conditions: SQL[] = [eq(products.isActive, true)];

  if (options.category && options.category !== 'all') {
    if (options.category === 'sale') {
      conditions.push(sql`${productPrices.originalPriceMinor} IS NOT NULL`);
    } else {
      conditions.push(eq(products.category, options.category));
    }
  }

  if (options.type) {
    conditions.push(eq(products.type, options.type));
  }

  if (options.color) {
    conditions.push(sql`${options.color} = ANY(${products.colors})`);
  }

  if (options.size) {
    conditions.push(sql`${options.size} = ANY(${products.sizes})`);
  }

  if (options.slugs && options.slugs.length > 0) {
    conditions.push(sql`${products.slug} = ANY(${options.slugs})`);
  }

  return (and(...conditions) ?? conditions[0]) as SQL;
}

function applySorting(sort?: CatalogSort): SQL[] {
  switch (sort) {
    case 'price-asc':
      return [asc(productPrices.price), asc(products.id)];
    case 'price-desc':
      return [desc(productPrices.price), asc(products.id)];
    case 'newest':
      return [desc(products.createdAt), asc(products.id)];
    case 'featured':
    default:
      return [
        desc(products.isFeatured),
        desc(products.createdAt),
        asc(products.id),
      ];
  }
}

export async function getActiveProducts(
  currency: CurrencyCode
): Promise<DbProduct[]> {
  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(currency))
    .where(eq(products.isActive, true));

  return await mapRowsToDbProducts(rows);
}

export async function getActiveProductsPage(options: {
  currency: CurrencyCode;
  limit: number;
  offset: number;
  slugs?: string[];
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  sort?: CatalogSort;
}): Promise<{ items: DbProduct[]; total: number }> {
  const whereClause = buildWhereClause(options);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(products)
    .innerJoin(productPrices, priceJoin(options.currency))
    .where(whereClause);

  const totalCount =
    typeof total === 'bigint' ? Number(total) : Number(total ?? 0);

  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(options.currency))
    .where(whereClause)
    .orderBy(...applySorting(options.sort))
    .limit(options.limit)
    .offset(options.offset);

  return { items: await mapRowsToDbProducts(rows), total: totalCount };
}

export async function getProductBySlug(
  slug: string,
  currency: CurrencyCode
): Promise<DbProduct | null> {
  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(currency))
    .where(eq(products.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const imagesByProductId = await getProductImagesByProductIds([row.id]);
  return mapRowToDbProduct(row, imagesByProductId);
}

export async function getPublicProductBySlug(
  slug: string,
  currency: CurrencyCode
): Promise<DbProduct | null> {
  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(currency))
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const imagesByProductId = await getProductImagesByProductIds([row.id]);
  return mapRowToDbProduct(row, imagesByProductId);
}

export async function getFeaturedProducts(
  currency: CurrencyCode,
  limit = 4
): Promise<DbProduct[]> {
  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(currency))
    .where(and(eq(products.isActive, true), eq(products.isFeatured, true)))
    .orderBy(desc(products.createdAt))
    .limit(limit);

  return await mapRowsToDbProducts(rows);
}

export async function getActiveProductsByIds(
  ids: string[],
  currency: CurrencyCode
): Promise<DbProduct[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select(publicProductSelect)
    .from(products)
    .innerJoin(productPrices, priceJoin(currency))
    .where(and(eq(products.isActive, true), inArray(products.id, ids)));

  return await mapRowsToDbProducts(rows);
}
