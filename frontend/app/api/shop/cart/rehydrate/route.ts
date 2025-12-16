import { NextRequest, NextResponse } from "next/server"

import { MoneyValueError } from "@/db/queries/shop/orders"
import { rehydrateCartItems } from "@/lib/services/products"
import { cartRehydratePayloadSchema } from "@/lib/validation/shop"

function normalizeCartPayload(body: unknown) {
  if (!body || typeof body !== "object") return body
  const { items, ...rest } = body as { items?: unknown }

  if (!Array.isArray(items)) return body

  return {
    ...rest,
    items: items.map((item) => {
      if (!item || typeof item !== "object") return item
      const { quantity, ...itemRest } = item as { quantity?: unknown }
      const normalizedQuantity =
        typeof quantity === "string" && quantity.trim().length > 0
          ? Number(quantity)
          : quantity

      return { ...itemRest, quantity: normalizedQuantity }
    }),
  }
}

export async function POST(request: NextRequest) {
  let body: unknown

  try {
    body = await request.json()
  } catch (error) {
    console.error("Failed to parse cart payload", error)
    return NextResponse.json({ error: "Unable to process cart data." }, { status: 400 })
  }

  const normalizedBody = normalizeCartPayload(body)
  const parsedPayload = cartRehydratePayloadSchema.safeParse(normalizedBody)

  if (!parsedPayload.success) {
    return NextResponse.json(
      { error: "Invalid cart payload", details: parsedPayload.error.format() },
      { status: 400 },
    )
  }

  try {
    const { items } = parsedPayload.data
    const parsedResult = await rehydrateCartItems(items)
    
    return NextResponse.json(parsedResult)
  } catch (error) {
    console.error("Cart rehydrate failed", error)
    if (error instanceof MoneyValueError) {
      return NextResponse.json(
        {
          code: "PRICE_CONFIG_ERROR",
          message: "Invalid price configuration for one or more products.",
          details: { productId: error.productId, field: error.field, rawValue: error.rawValue },
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ error: "Unable to rehydrate cart." }, { status: 500 })
  }
}
