export const dynamic = "force-dynamic"

import Link from "next/link"

import { getAdminOrdersPage } from "@/db/queries/shop/admin-orders"

function formatCurrency(value: string | number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "-"
  const numericValue = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(numericValue)) return "-"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "-"
  return value.toLocaleDateString()
}

export default async function AdminOrdersPage() {
  const { items } = await getAdminOrdersPage({ limit: 50, offset: 0 })

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Admin · Orders</h1>

        <form action="/api/shop/admin/orders/reconcile-stale" method="post">
          <button
            type="submit"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Reconcile stale
          </button>
        </form>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Created</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Total</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Items</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Provider</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Order ID</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map(order => (
              <tr key={order.id} className="hover:bg-muted/50">
                <td className="px-3 py-2 text-muted-foreground">{formatDate(order.createdAt)}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                    {order.paymentStatus}
                  </span>
                </td>
                <td className="px-3 py-2 text-foreground">
                  {formatCurrency(order.totalAmount, order.currency ?? "USD")}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{order.itemCount}</td>
                <td className="px-3 py-2 text-muted-foreground">{order.paymentProvider}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{order.id}</td>
                <td className="px-3 py-2">
                  <Link
                    href={`/shop/admin/orders/${order.id}`}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
                  No orders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
