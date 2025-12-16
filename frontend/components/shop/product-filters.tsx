"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { COLORS, CATEGORIES, PRODUCT_TYPES, SIZES } from "@/lib/config/catalog"
import { cn } from "@/lib/utils"

export function ProductFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get("category") || "all"
  const currentType = searchParams.get("type")
  const currentColor = searchParams.get("color")
  const currentSize = searchParams.get("size")

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")

    if (value && value !== "all") {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    const queryString = params.toString()
    router.push(queryString ? `/shop/products?${queryString}` : "/shop/products")
  }

  return (
    <aside className="space-y-8">
      {/* Categories */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Category</h3>
        <ul className="mt-4 space-y-2">
          {CATEGORIES.map((cat) => (
            <li key={cat.slug}>
              <button
                onClick={() => updateFilter("category", cat.slug)}
                className={cn(
                  "text-sm transition-colors",
                  currentCategory === cat.slug
                    ? "font-medium text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Types */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Type</h3>
        <ul className="mt-4 space-y-2">
          {PRODUCT_TYPES.map((type) => (
            <li key={type.slug}>
              <button
                onClick={() => updateFilter("type", currentType === type.slug ? null : type.slug)}
                className={cn(
                  "text-sm transition-colors",
                  currentType === type.slug ? "font-medium text-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {type.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Colors */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Color</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {COLORS.map((color) => (
            <button
              key={color.slug}
              onClick={() => updateFilter("color", currentColor === color.slug ? null : color.slug)}
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-all",
                currentColor === color.slug
                  ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background"
                  : "border-border hover:border-muted-foreground",
              )}
              style={{
                background: color.hex,
              }}
              title={color.label}
              aria-label={color.label}
            />
          ))}
        </div>
      </div>

      {/* Sizes */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">Size</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() => updateFilter("size", currentSize === size ? null : size)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors",
                currentSize === size
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
