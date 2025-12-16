import { NextRequest, NextResponse } from "next/server"

import { restockStalePendingOrders } from "@/lib/services/orders"

export async function POST(request: NextRequest) {
  let olderThanMinutes: number | undefined
  const queryValue = request.nextUrl.searchParams.get("olderThanMinutes")

  if (queryValue !== null) {
    const parsedQuery = Number(queryValue)
    if (!Number.isNaN(parsedQuery)) {
      olderThanMinutes = parsedQuery
    }
  }

  if (olderThanMinutes === undefined) {
    try {
      const body = await request.json()
      const candidate =
        body && typeof body === "object" && "olderThanMinutes" in body
          ? (body as Record<string, unknown>).olderThanMinutes
          : undefined

      if (candidate !== undefined) {
        const parsedBodyValue = Number(candidate)
        if (!Number.isNaN(parsedBodyValue)) {
          olderThanMinutes = parsedBodyValue
        }
      }
    } catch {
      // ignore body parsing errors and fall back to default
    }
  }

  const effectiveOlderThanMinutes = olderThanMinutes ?? 60
  const processed = await restockStalePendingOrders({ olderThanMinutes: effectiveOlderThanMinutes })

  return NextResponse.json({ success: true, processed, olderThanMinutes: effectiveOlderThanMinutes })
}