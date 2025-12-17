"use client"

import { Moon, Sun } from "lucide-react"

import { useTheme } from "../theme-provider"
import { useMounted } from "@/hooks/use-mounted"

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme()
  const mounted = useMounted()

  if (!mounted) return null

  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label="Toggle theme"
    >
      {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  )
}
