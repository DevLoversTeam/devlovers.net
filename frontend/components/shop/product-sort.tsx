"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { SORT_OPTIONS } from "@/lib/config/catalog"

export function ProductSort() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentSort = searchParams.get("sort") || "featured"

  const handleSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("page")

    if (value === "featured") {
      params.delete("sort")
    } else {
      params.set("sort", value)
    }
    const queryString = params.toString()
    router.push(queryString ? `/shop/products?${queryString}` : "/shop/products")
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-muted-foreground">
        Sort by:
      </label>
      <select
        id="sort"
        value={currentSort}
        onChange={(e) => handleSort(e.target.value)}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
