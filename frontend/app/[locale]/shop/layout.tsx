import type React from "react"

import { ThemeProvider } from "@/components/shop/theme-provider"
import { CartProvider } from "@/components/shop/cart-provider"

import "./shop-theme.css"

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop-scope min-h-screen">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            
            <main className="flex-1">{children}</main>
            
          </div>
        </CartProvider>
      </ThemeProvider>
    </div>
  )
}
