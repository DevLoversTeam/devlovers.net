import type React from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminPage,
} from "@/lib/auth/admin"

export default async function ShopAdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminPage()
  } catch (err) {
    // Admin is hard-disabled in prod → do not expose the page
    if (err instanceof AdminApiDisabledError) notFound()

    // Not logged in → go to login
    if (err instanceof AdminUnauthorizedError) redirect("/login")

    // Logged in but not admin → hide existence
    if (err instanceof AdminForbiddenError) notFound()

    throw err
  }

  return (
    <>
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/shop/admin"
              className="text-sm font-semibold text-foreground hover:underline"
            >
              Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              href="/shop/admin/products"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Products
            </Link>
            <Link
              href="/shop/admin/orders"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Orders
            </Link>
          </div>

          <Link
            href="/shop"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Back to shop
          </Link>
        </div>
      </div>

      {children}
    </>
  )
}
