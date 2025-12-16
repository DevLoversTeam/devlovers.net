import { NextRequest, NextResponse } from "next/server"

import { AdminApiDisabledError, requireAdminApi } from "@/lib/auth/admin"
import { logError } from "@/lib/logging"
import { toggleProductStatus } from "@/lib/services/products"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminApi(request)

    const { id: productId } = await context.params

    if (!productId) {
      return NextResponse.json({ error: "Product id is required" }, { status: 400 })
    }

    const updated = await toggleProductStatus(productId)
    return NextResponse.json({ success: true, product: updated })
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json({ code: "ADMIN_API_DISABLED" }, { status: 403 })
    }
    logError("Failed to update product status", error)
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }
    return NextResponse.json(
      { error: "Failed to update product status" },
      { status: 500 },
    )
  }
}
