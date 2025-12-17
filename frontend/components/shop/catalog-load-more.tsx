"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

interface CatalogLoadMoreProps {
  hasMore: boolean
  nextPage: number
}

export function CatalogLoadMore({ hasMore, nextPage }: CatalogLoadMoreProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  if (!hasMore) return null

  const handleClick = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams?.toString())
      params.set("page", nextPage.toString())
      router.push(`/shop/products?${params.toString()}`)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isPending ? "Loading..." : "Load more"}
    </button>
  )
}
