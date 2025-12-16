"use client"

import { useState } from "react"

interface AdminProductStatusToggleProps {
  id: string
  initialIsActive: boolean
}

export function AdminProductStatusToggle({ id, initialIsActive }: AdminProductStatusToggleProps) {
  const [isActive, setIsActive] = useState(initialIsActive)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleStatus = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/shop/admin/products/${id}/status`, {
        method: "PATCH",
      })

      if (!response.ok) {
        setError("Failed to update status")
        return
      }

      const data: { product?: { isActive?: boolean } } = await response.json()

      if (typeof data.product?.isActive === "boolean") {
        setIsActive(data.product.isActive)
      }
    } catch (err) {
      console.error("Failed to toggle product status", err)
      setError("Failed to update status")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={toggleStatus}
        disabled={isLoading}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "Updating..." : isActive ? "Deactivate" : "Activate"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}
