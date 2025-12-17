import { NextRequest, NextResponse } from "next/server"

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from "@/lib/auth/admin"

import { getAdminOrderDetail } from "@/db/queries/shop/admin-orders"
import { logError } from "@/lib/logging"
import { orderIdParamSchema } from "@/lib/validation/shop"

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminApi(_request)

    const rawParams = await context.params
    const parsed = orderIdParamSchema.safeParse(rawParams)

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order id", code: "INVALID_ORDER_ID" }, { status: 400 })
    }

    const order = await getAdminOrderDetail(parsed.data.id)
    if (!order) {
      return NextResponse.json({ error: "Order not found", code: "ORDER_NOT_FOUND" }, { status: 404 })
    }

    return NextResponse.json(
      {
        success: true,
        order: {
          ...order,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
          restockedAt: order.restockedAt ? order.restockedAt.toISOString() : null,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json({ code: error.code }, { status: 403 })
    }
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ code: error.code }, { status: 401 })
    }
    if (error instanceof AdminForbiddenError) {
      return NextResponse.json({ code: error.code }, { status: 403 })
    }

    logError("Admin order detail failed", error)
    return NextResponse.json({ error: "internal_error", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
