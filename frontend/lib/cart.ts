import { z } from "zod"

import { fromCents, toCents } from "@/lib/shop/money"

import {
  cartClientItemSchema,
  cartRehydrateResultSchema,
  MAX_QUANTITY_PER_LINE,
  type CartClientItem as ValidationCartClientItem,
  type CartRehydrateItem,
  type CartRehydrateResult,
  type CartRemovedItem,
} from "@/lib/validation/shop"

const CART_KEY = "devlovers-cart"

export type Cart = CartRehydrateResult
export type CartItem = CartRehydrateItem
export type CartSummary = CartRehydrateResult["summary"]
export type CartClientItem = ValidationCartClientItem

export const emptyCart: Cart = {
  items: [],
  removed: [],
  summary: { totalAmount: 0, itemCount: 0, currency: "USD" },
}

const legacyStoredProductSchema = z.object({
  id: z.string(),
})

const legacyStoredCartItemSchema = z.object({
  product: legacyStoredProductSchema,
  quantity: z.union([z.number(), z.string()]).transform((value) => {
    const parsed = typeof value === "string" ? parseInt(value, 10) : Math.trunc(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return 1
    return Math.min(parsed, MAX_QUANTITY_PER_LINE)
  }),
  selectedSize: z.string().optional(),
  selectedColor: z.string().optional(),
})

export function createCartItemKey(productId: string, selectedSize?: string, selectedColor?: string): string {
  return [productId, selectedSize ?? "", selectedColor ?? ""].join("::")
}

export function capQuantityByStock(quantity: number, stock: number): number {
  return Math.max(0, Math.min(quantity, Math.max(stock, 0), MAX_QUANTITY_PER_LINE))
}

function normalizeStoredItem(rawItem: unknown): CartClientItem | null {
  const parsed = cartClientItemSchema.safeParse(rawItem)
  if (parsed.success) return parsed.data

  const legacy = legacyStoredCartItemSchema.safeParse(rawItem)
  if (legacy.success) {
    return {
      productId: legacy.data.product.id,
      quantity: legacy.data.quantity,
      selectedSize: legacy.data.selectedSize,
      selectedColor: legacy.data.selectedColor,
    }
  }

  return null
}

export function getStoredCartItems(): CartClientItem[] {
  if (typeof window === "undefined") return []

  try {
    const stored = window.localStorage.getItem(CART_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((item) => normalizeStoredItem(item))
      .filter((item): item is CartClientItem => item !== null)
  } catch (error) {
    console.warn("Failed to read cart from localStorage", error)
    return []
  }
}

export function persistCartItems(items: CartClientItem[]): void {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items))
  } catch (error) {
    console.warn("Failed to save cart", error)
  }
}

function normalizeItemsForStorage(items: CartRehydrateItem[]): CartClientItem[] {
  return items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    selectedSize: item.selectedSize,
    selectedColor: item.selectedColor,
  }))
}

export function computeSummaryFromItems(items: CartRehydrateItem[]): CartSummary {
  const totals = items.reduce(
    (acc, item) => {
      acc.totalCents += toCents(item.lineTotal)
      acc.itemCount += item.quantity
      return acc
    },
    { totalCents: 0, itemCount: 0, currency: (items[0]?.currency ?? "USD") as CartSummary["currency"] },
  )

  return {
    totalAmount: fromCents(totals.totalCents),
    itemCount: totals.itemCount,
    currency: totals.currency,
  }
}

export async function rehydrateCart(items: CartClientItem[]): Promise<Cart> {
  if (!items.length) {
    persistCartItems([])
    return emptyCart
  }

  const response = await fetch("/api/shop/cart/rehydrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error ?? "Unable to rehydrate cart")
  }

  const parsed = cartRehydrateResultSchema.parse(data)
  const normalizedForStorage = normalizeItemsForStorage(parsed.items)
  persistCartItems(normalizedForStorage)

  return parsed
}

export function buildCartFromItems(items: CartRehydrateItem[], removed: CartRemovedItem[] = []): Cart {
  const summary = computeSummaryFromItems(items)
  return { items, removed, summary }
}

export function clearStoredCart(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CART_KEY)
  }
}
