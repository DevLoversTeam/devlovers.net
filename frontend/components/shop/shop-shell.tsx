"use client"

import type React from "react"

import { ThemeProvider as ShopThemeProvider } from "@/components/shop/theme-provider"
import { CartProvider } from "@/components/shop/cart-provider"
import { Header as ShopHeader } from "@/components/shop/shop-header"

import "@/app/[locale]/shop/shop-theme.css"

export function ShopShell({
  children,
  showAdminLink,
}: {
  children: React.ReactNode
  showAdminLink: boolean
}) {
  return (
    <div className="shop-scope min-h-screen">
      <ShopThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <CartProvider>
          <ShopHeader showAdminLink={showAdminLink} />
          {children}
        </CartProvider>
      </ShopThemeProvider>
    </div>
  )
}
