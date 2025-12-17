"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  )
}

export function useTheme() {
  const { theme, setTheme, resolvedTheme } = useNextTheme()

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "light" ? "dark" : "light")
  }, [resolvedTheme, setTheme])

  return {
    theme: (resolvedTheme || "light") as "light" | "dark",
    toggleTheme,
    setTheme,
  }
}
