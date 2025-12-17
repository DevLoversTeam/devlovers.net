import Link from "next/link"
import { desc } from "drizzle-orm"

import { AdminProductStatusToggle } from "@/components/shop/admin/admin-product-status-toggle"
import { db } from "@/db"
import { products } from "@/db/schema"

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

function formatDate(value: Date | null) {
  if (!value) return "-"
  return value.toLocaleDateString()
}

export default async function AdminProductsPage() {
  const allProducts = await db.select().from(products).orderBy(desc(products.createdAt))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Admin · Products</h1>
        <Link
          href="/shop/admin/products/new"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          New product
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Title</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Slug</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Price</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Category</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Type</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Stock</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Badge</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Active</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Featured</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Created</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allProducts.map((product) => (
              <tr key={product.id} className="hover:bg-muted/50">
                <td className="px-3 py-2 font-medium text-foreground">{product.title}</td>
                <td className="px-3 py-2 text-muted-foreground">{product.slug}</td>
                <td className="px-3 py-2 text-foreground">
                  {formatCurrency(product.price, product.currency ?? "USD")}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{product.category ?? "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{product.type ?? "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{product.stock}</td>
                <td className="px-3 py-2 text-muted-foreground">{product.badge === "NONE" ? "-" : product.badge}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground"
                    aria-label={product.isActive ? "Active" : "Inactive"}
                  >
                    {product.isActive ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground"
                    aria-label={product.isFeatured ? "Featured" : "Not featured"}
                  >
                    {product.isFeatured ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{formatDate(product.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/shop/products/${product.slug}`}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      View
                    </Link>
                    <Link
                      href={`/shop/admin/products/${product.id}/edit`}
                      className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Edit
                    </Link>
                    <AdminProductStatusToggle id={product.id} initialIsActive={product.isActive} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
