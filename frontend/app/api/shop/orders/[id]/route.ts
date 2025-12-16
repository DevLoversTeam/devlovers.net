import { NextRequest, NextResponse } from "next/server"

import { OrderNotFoundError } from "@/lib/services/errors"
import { getOrderSummary } from "@/lib/services/orders"
import { orderIdParamSchema, orderSummarySchema } from "@/lib/validation/shop"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const rawParams = await context.params
    const parsed = orderIdParamSchema.safeParse(rawParams)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid order id", code: "INVALID_ORDER_ID" },
        { status: 400 },
      )
    }


    const order = await getOrderSummary(parsed.data.id)

    const orderSummary = orderSummarySchema.parse(order)

    return NextResponse.json({
      success: true,
      order: {
        ...orderSummary,
        createdAt: orderSummary.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error("Get order failed", error)
    if (error instanceof OrderNotFoundError) {
      return NextResponse.json(
        { error: "Order not found", code: error.code },
        { status: 404 },
      )
    }
    return NextResponse.json(
      { error: "Unable to fetch order.", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
