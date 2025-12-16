// app/shop/layout.tsx
import type React from "react"

import { ThemeProvider } from "@/components/shop/theme-provider"
import { CartProvider } from "@/components/shop/cart-provider"
import { Header } from "@/components/shop/shop-header"
import { Footer } from "@/components/shop/shop-footer"

import "./shop-theme.css"

const showAdminNavLink = process.env.NEXT_PUBLIC_ENABLE_ADMIN === "true"

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop-scope min-h-screen">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <CartProvider>
          <div className="flex min-h-screen flex-col">
            <Header showAdminLink={showAdminNavLink} />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </CartProvider>
      </ThemeProvider>
    </div>
  )
}
