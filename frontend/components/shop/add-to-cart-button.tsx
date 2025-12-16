"use client"

import { useState } from "react"
import type { ShopProduct } from "@/lib/shop/data"
import { useCart } from "./cart-provider"
import { cn } from "@/lib/utils"
import { Check, Minus, Plus } from "lucide-react"

interface AddToCartButtonProps {
  product: ShopProduct
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addToCart } = useCart()
  const [selectedSize, setSelectedSize] = useState<string | undefined>(product.sizes?.[0])
  const [selectedColor, setSelectedColor] = useState<string | undefined>(product.colors?.[0])
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  const handleAddToCart = () => {
    if (!product.inStock) return

    addToCart(product, quantity, selectedSize, selectedColor)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const colorMap: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    grey: "#6b7280",
    navy: "#1e3a5f",
    multicolor: "linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)",
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Colors */}
      {product.colors && product.colors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground">Color</h3>
          <div className="mt-3 flex gap-2">
            {product.colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={cn(
                  "h-9 w-9 rounded-full border-2 transition-all",
                  selectedColor === color
                    ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-background"
                    : "border-border hover:border-muted-foreground",
                )}
                style={{
                  background: colorMap[color] || color,
                }}
                title={color}
                aria-label={color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sizes */}
      {product.sizes && product.sizes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground">Size</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.sizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(size)}
                className={cn(
                  "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
                  selectedSize === size
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-foreground hover:border-foreground",
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div>
        <h3 className="text-sm font-medium text-foreground">Quantity</h3>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-lg font-medium">{quantity}</span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add to Cart Button */}
      <button
        onClick={handleAddToCart}
        disabled={!product.inStock}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-colors",
          product.inStock
            ? added
              ? "bg-green-600 text-white"
              : "bg-accent text-accent-foreground hover:bg-accent/90"
            : "cursor-not-allowed bg-muted text-muted-foreground",
        )}
      >
        {!product.inStock ? (
          "Sold Out"
        ) : added ? (
          <>
            <Check className="h-5 w-5" />
            Added to cart
          </>
        ) : (
          "Add to cart"
        )}
      </button>
    </div>
  )
}
