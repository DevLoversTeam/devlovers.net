import { and, eq, inArray } from "drizzle-orm"
import { products } from "@/db/schema"
import { db } from "@/db"

import { type OrderSummary as ValidationOrderSummary } from "@/lib/validation/shop"
import { InsufficientStockError } from "@/lib/services/errors"
import { MoneyCents, fromCents, fromDbMoney, sumLineTotals, toCents } from "@/lib/shop/money"
export { InsufficientStockError } from "@/lib/services/errors"

export class MoneyValueError extends Error {
  field?: string
  rawValue: unknown
  productId?: string

  constructor({ field, rawValue, productId }: { field?: string; rawValue: unknown; productId?: string }) {
    super(`Invalid monetary value for ${field ?? "price"}`)
    this.name = "MoneyValueError"
    this.field = field
    this.rawValue = rawValue
    this.productId = productId
  }
}

export interface OrderItemSummary {
  productId: string
  productTitle: string
  productSlug: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export type OrderSummary = ValidationOrderSummary

export function coercePriceFromDb(price: unknown, context?: { field?: string; productId?: string }): number {
  if (price === null || price === undefined) {
    throw new MoneyValueError({
      field: context?.field,
      rawValue: price,
      productId: context?.productId,
    })
  }

  try {
    return fromCents(fromDbMoney(price))
  } catch {
    throw new MoneyValueError({
      field: context?.field,
      rawValue: price,
      productId: context?.productId,
    })
  }
}


export function calculateOrderTotal(items: Array<{ lineTotal: number; lineTotalCents?: MoneyCents }>): number {
  const normalized = items.map((item) => item.lineTotalCents ?? toCents(item.lineTotal))

  return fromCents(sumLineTotals(normalized))
}

export interface PricedItemInput {
  productId: string
  stock: number
  requestedQty: number
}

export function ensureSufficientStock(items: PricedItemInput[]) {
  for (const item of items) {
    if (item.stock < 0) {
      throw new Error(`Invalid stock configuration for product ${item.productId}`)
    }

    if (item.stock <= 0 && item.requestedQty > 0) {
      throw new InsufficientStockError(`Product ${item.productId} is out of stock`)
    }

    if (item.requestedQty > item.stock) {
      throw new InsufficientStockError(
        `Requested quantity exceeds stock for product ${item.productId}`,
      )
    }
  }
}

export async function getActiveProductsWithIds(ids: string[]) {
  if (ids.length === 0) return []

  return db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), inArray(products.id, ids)))
}
