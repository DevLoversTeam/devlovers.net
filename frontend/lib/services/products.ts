import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { destroyProductImage, uploadProductImageFromFile } from "@/lib/cloudinary"
import { requireDb } from "@/lib/db/client"
import { products } from "@/lib/db/schema"
import { logError } from "@/lib/logging"
import { calculateLineTotal, fromCents, fromDbMoney, toCents, toDbMoney } from "@/lib/shop/money"
import { slugify } from "@/lib/shop/slug"
import { MAX_QUANTITY_PER_LINE, cartRehydrateResultSchema } from "@/lib/validation/shop"
import { coercePriceFromDb } from "@/lib/db/orders"
import type { CartClientItem, CartRehydrateItem, CartRehydrateResult, CartRemovedItem } from "@/lib/validation/shop"
import { DbProduct, ProductInput, ProductUpdateInput } from "@/lib/types/shop"
import { SlugConflictError } from "./errors"


export type AdminProductsFilter = {
  isActive?: boolean
  category?: string
  type?: string
}

type ProductsTable = typeof products

type ProductRow = ProductsTable["$inferSelect"]

type DbClient = ReturnType<typeof requireDb>

function randomSuffix(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length)
}

async function ensureUniqueSlug(
  db: DbClient,
  baseSlug: string,
  options?: { excludeId?: string },
): Promise<string> {
  let candidate = baseSlug
  let attempts = 0

  while (true) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(
        options?.excludeId
          ? and(eq(products.slug, candidate), ne(products.id, options.excludeId))
          : eq(products.slug, candidate),
      )
      .limit(1)

    if (!existing.length) return candidate

    attempts += 1
    if (attempts > 10) {
      throw new SlugConflictError("Unable to generate unique slug")
    }

    candidate = `${baseSlug}-${randomSuffix()}`
  }
}

async function normalizeSlug(db: DbClient, slug: string, options?: { excludeId?: string }) {
  const normalized = slugify(slug)

  if (!normalized) {
    throw new SlugConflictError("Slug could not be generated")
  }

  return ensureUniqueSlug(db, normalized, options)
}

function mapRowToProduct(row: ProductRow): DbProduct {
  const priceCents = fromDbMoney(row.price)
  const originalPriceCents = row.originalPrice == null ? undefined : fromDbMoney(row.originalPrice)

  return {
    ...row,
    description: row.description ?? undefined,
    price: fromCents(priceCents),
    originalPrice: originalPriceCents == null ? undefined : fromCents(originalPriceCents),
    imagePublicId: row.imagePublicId ?? undefined,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    type: row.type ?? undefined,
  }
}

export async function createProduct(input: ProductInput): Promise<DbProduct> {
  const db = requireDb()
  const slug = await normalizeSlug(db, input.slug ?? input.title)

  let uploaded: { secureUrl: string; publicId: string } | null = null

  try {
    uploaded = await uploadProductImageFromFile(input.image)
  } catch (error) {
    logError("Failed to upload product image", error)
    throw error
  }

  try {
    const [created] = await db.transaction(async (tx) => {
      const priceCents = toCents(input.price)
      const originalPriceCents = input.originalPrice ? toCents(input.originalPrice) : null

      const [row] = await tx
        .insert(products)
        .values({
          slug,
          title: input.title,
          description: input.description ?? null,
          imageUrl: uploaded?.secureUrl ?? "",
          imagePublicId: uploaded?.publicId,
          price: toDbMoney(priceCents),
          originalPrice: originalPriceCents ? toDbMoney(originalPriceCents) : null,
          currency: input.currency,
          category: input.category ?? null,
          type: input.type ?? null,
          colors: input.colors ?? [],
          sizes: input.sizes ?? [],
          badge: input.badge ?? "NONE",
          isActive: input.isActive ?? true,
          isFeatured: input.isFeatured ?? false,
          stock: input.stock ?? 0,
          sku: input.sku ?? null,
        })
        .onConflictDoNothing({ target: products.slug })
        .returning()

      if (!row) {
        throw new SlugConflictError("Slug already exists.")
      }

      return [row]
    })

    return mapRowToProduct(created)
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId)
      } catch (cleanupError) {
        logError("Failed to cleanup uploaded image after create failure", cleanupError)
      }
    }
    if (error instanceof SlugConflictError) {
      throw error
    }
    throw error
  }
}

export async function updateProduct(id: string, input: ProductUpdateInput): Promise<DbProduct> {
  const db = requireDb()
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1)

  if (!existing) {
    throw new Error("PRODUCT_NOT_FOUND")
  }

  const slug = await normalizeSlug(db, input.slug ?? input.title ?? existing.slug, { excludeId: id })

  let uploaded: { secureUrl: string; publicId: string } | null = null

  if (input.image instanceof File && input.image.size > 0) {
    try {
      uploaded = await uploadProductImageFromFile(input.image)
    } catch (error) {
      logError("Failed to upload replacement image", error)
      throw error
    }
  }

  const normalizedPrice =
    input.price !== undefined ? toDbMoney(toCents(input.price)) : existing.price
  const normalizedOriginalPrice =
    input.originalPrice !== undefined
      ? input.originalPrice
        ? toDbMoney(toCents(input.originalPrice))
        : null
      : existing.originalPrice

  const updateData: Partial<ProductsTable["$inferInsert"]> = {
    slug,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description ?? null,
    imageUrl: uploaded ? uploaded.secureUrl : existing.imageUrl,
    imagePublicId: uploaded ? uploaded.publicId : existing.imagePublicId,
    price: normalizedPrice,
    originalPrice: normalizedOriginalPrice,
    currency: input.currency ?? existing.currency,
    category: input.category ?? existing.category,
    type: input.type ?? existing.type,
    colors: input.colors ?? existing.colors,
    sizes: input.sizes ?? existing.sizes,
    badge: input.badge ?? existing.badge,
    isActive: input.isActive ?? existing.isActive,
    isFeatured: input.isFeatured ?? existing.isFeatured,
    stock: input.stock ?? existing.stock,
    sku: input.sku !== undefined ? (input.sku ? input.sku : null) : existing.sku,
  }

  try {
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(products)
        .set(updateData)
        .where(eq(products.id, id))
        .returning()

      return [row]
    })

    if (uploaded && existing.imagePublicId) {
      try {
        await destroyProductImage(existing.imagePublicId)
      } catch (cleanupError) {
        logError("Failed to cleanup old image after update", cleanupError)
      }
    }

    return mapRowToProduct(updated)
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId)
      } catch (cleanupError) {
        logError("Failed to cleanup uploaded image after update failure", cleanupError)
      }
    }

    if ((error as { code?: string }).code === "23505") {
      throw new SlugConflictError("Slug already exists.")
    }

    throw error
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const db = requireDb()
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  if (!existing) {
    throw new Error("PRODUCT_NOT_FOUND")
  }

  await db.delete(products).where(eq(products.id, id))

  if (existing.imagePublicId) {
    try {
      await destroyProductImage(existing.imagePublicId)
    } catch (error) {
      logError("Failed to cleanup product image after delete", error)
    }
  }
}

export async function getAdminProductById(id: string): Promise<DbProduct> {
  const db = requireDb()
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  if (!row) {
    throw new Error("PRODUCT_NOT_FOUND")
  }
  return mapRowToProduct(row)
}

export async function getAdminProductsList(filters: AdminProductsFilter = {}): Promise<DbProduct[]> {
  const db = requireDb()
  const conditions: any[] = []

  if (typeof filters.isActive === "boolean") {
    conditions.push(eq(products.isActive, filters.isActive))
  }
  if (filters.category) {
    conditions.push(eq(products.category, filters.category))
  }
  if (filters.type) {
    conditions.push(eq(products.type, filters.type))
  }

  const rows = await db
    .select()
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined)

  return rows.map(mapRowToProduct)
}

export async function rehydrateCartItems(items: CartClientItem[]): Promise<CartRehydrateResult> {
  const uniqueProductIds = Array.from(new Set(items.map((item) => item.productId)))
  const db = requireDb()
    const dbProducts = await db
    .select()
    .from(products)
    .where(inArray(products.id, uniqueProductIds))


  const productMap = new Map(dbProducts.map((product) => [product.id, product]))

  const rehydratedItems: CartRehydrateItem[] = []
  const removed: CartRemovedItem[] = []
  let totalCents = 0

  for (const item of items) {
    const product = productMap.get(item.productId)

    if (!product) {
      // продукт взагалі не існує в БД
      removed.push({ productId: item.productId, reason: "not_found" })
      continue
    }

    if (!product.isActive) {
      // продукт більше не доступний покупцю — для фронта це теж "not_found"
      removed.push({ productId: item.productId, reason: "not_found" })
      continue
    }


    const stock = product.stock

    if (stock <= 0) {
      removed.push({ productId: item.productId, reason: "out_of_stock" })
      continue
    }

    const effectiveQuantity = Math.min(item.quantity, stock, MAX_QUANTITY_PER_LINE)

    const unitPriceRaw = coercePriceFromDb(product.price, { field: "price", productId: product.id })
    const unitPriceCents = toCents(unitPriceRaw)
    const unitPrice = fromCents(unitPriceCents)
    const lineTotalCents = calculateLineTotal(unitPriceCents, effectiveQuantity)
    const lineTotal = fromCents(lineTotalCents)
    totalCents += lineTotalCents

    rehydratedItems.push({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      quantity: effectiveQuantity,
      unitPrice,
      lineTotal,
      currency: product.currency,
      stock,
      badge: product.badge ?? "NONE",
      imageUrl: product.imageUrl,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    })
  }

  const totalAmount = fromCents(totalCents)
  const itemCount = rehydratedItems.reduce((total, item) => total + item.quantity, 0)
  const currency = rehydratedItems[0]?.currency ?? "USD"

  const result = {
    items: rehydratedItems,
    removed,
    summary: { totalAmount, itemCount, currency },
  }

  return cartRehydrateResultSchema.parse(result)
}

export async function toggleProductStatus(id: string): Promise<DbProduct> {
  const db = requireDb()
  const [current] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  if (!current) {
    throw new Error("PRODUCT_NOT_FOUND")
  }

  const [updated] = await db
    .update(products)
    .set({ isActive: !current.isActive })
    .where(eq(products.id, id))
    .returning()

  return mapRowToProduct(updated)
}
