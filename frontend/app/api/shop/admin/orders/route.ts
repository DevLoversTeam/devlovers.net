import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from "@/lib/auth/admin"

import { getAdminOrdersPage } from "@/db/queries/shop/admin-orders"
import { logError } from "@/lib/logging"

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function GET(request: NextRequest) {
  try {
    await requireAdminApi(request)

    const url = new URL(request.url)
    const parsedQuery = querySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    })

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query", code: "INVALID_QUERY", details: parsedQuery.error.format() },
        { status: 400 }
      )
    }

    const { items, total } = await getAdminOrdersPage(parsedQuery.data)

    return NextResponse.json(
      {
        success: true,
        total,
        orders: items.map(o => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
        })),
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

    logError("Admin orders list failed", error)
    return NextResponse.json({ error: "internal_error", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
