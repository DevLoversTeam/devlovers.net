import { and, asc, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type { CatalogSort } from "@/lib/config/catalog"
import { products } from "@/db/schema"
import { dbProductSchema, type DbProduct } from "@/lib/validation/shop"

export type DbProductRow = typeof products.$inferSelect

function mapRowToDbProduct(row: DbProductRow): DbProduct {
  return dbProductSchema.parse({
    ...row,
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
  })
}

function buildWhereClause(options: {
  category?: string
  type?: string
  color?: string
  size?: string
  slugs?: string[]
}): SQL {
  const conditions: SQL[] = [eq(products.isActive, true)]

  if (options.category && options.category !== "all") {
    if (options.category === "new-arrivals") {
      conditions.push(eq(products.isFeatured, true))
    } else if (options.category === "sale") {
      const saleCondition = or(
        eq(products.badge, "SALE"),
        sql`${products.originalPrice} IS NOT NULL`
      ) as SQL
      conditions.push(saleCondition)
    } else {
      conditions.push(eq(products.category, options.category))
    }
  }

  if (options.type) {
    conditions.push(eq(products.type, options.type))
  }

  if (options.color) {
    conditions.push(sql`${options.color} = ANY(${products.colors})`)
  }

  if (options.size) {
    conditions.push(sql`${options.size} = ANY(${products.sizes})`)
  }

  if (options.slugs && options.slugs.length > 0) {
    conditions.push(sql`${products.slug} = ANY(${options.slugs})`)
  }

  // and(...) теж може повертати union, тому фіксуємо
  return (and(...conditions) ?? conditions[0]) as SQL
}


function applySorting(sort?: CatalogSort): SQL {
  switch (sort) {
    case "price-asc":
      return asc(products.price)
    case "price-desc":
      return desc(products.price)
    case "newest":
      return desc(products.createdAt)
    default:
      // будь-який fallback, нехай буде "найновіші"
      return desc(products.createdAt)
  }
}

export async function getActiveProducts(): Promise<DbProduct[]> {
  const rows = await db.select().from(products).where(eq(products.isActive, true))
  return rows.map(mapRowToDbProduct)
}

export async function getActiveProductsPage(options: {
  limit: number
  offset: number
  slugs?: string[]
  category?: string
  type?: string
  color?: string
  size?: string
  sort?: CatalogSort
}): Promise<{ items: DbProduct[]; total: number }> {
  const whereClause = buildWhereClause(options)

  const [{ value: total }] = await db.select({ value: count() }).from(products).where(whereClause)

  const totalCount = typeof total === "bigint" ? Number(total) : Number(total ?? 0)

  const rows = await db
    .select()
    .from(products)
    .where(whereClause)
    .orderBy(applySorting(options.sort))
    .limit(options.limit)
    .offset(options.offset)

  return { items: rows.map(mapRowToDbProduct), total: totalCount }
}

export async function getProductBySlug(slug: string): Promise<DbProduct | null> {

  const rows = await db.select().from(products).where(eq(products.slug, slug)).limit(1)
  const row = rows[0]
  return row ? mapRowToDbProduct(row) : null
}

export async function getPublicProductBySlug(slug: string): Promise<DbProduct | null> {

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1)
  const row = rows[0]
  return row ? mapRowToDbProduct(row) : null
}

export async function getFeaturedProducts(limit = 4): Promise<DbProduct[]> {

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.isFeatured, true)))
    .orderBy(desc(products.createdAt))
    .limit(limit)

  return rows.map(mapRowToDbProduct)
}

export async function getActiveProductsByIds(ids: string[]): Promise<DbProduct[]> {
  if (ids.length === 0) return []

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), inArray(products.id, ids)))

  return rows.map(mapRowToDbProduct)
}
