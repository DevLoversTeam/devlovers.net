"use client"

import { Link } from '@/i18n/routing'
import { ShoppingBag } from "lucide-react"

import { useCart } from "../cart-provider"
import { useMounted } from "@/hooks/use-mounted"

export function CartButton() {
  const { cart } = useCart()
  const mounted = useMounted()
  const showCount = mounted && cart.summary.itemCount > 0

  return (
    <Link
      href="/shop/cart"
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label="Cart"
    >
      <ShoppingBag className="h-5 w-5" />
      {showCount && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
          {cart.summary.itemCount}
        </span>
      )}
    </Link>
  )
}
