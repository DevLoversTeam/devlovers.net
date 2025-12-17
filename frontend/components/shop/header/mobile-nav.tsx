"use client"

import { Menu, X } from "lucide-react"
import { useState } from "react"

import { NavLinks } from "./nav-links"

interface MobileNavProps {
  showAdminLink?: boolean
}

export function MobileNav({ showAdminLink = false }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
        aria-label="Toggle menu"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <nav className="border-t border-border bg-background px-4 py-4 md:hidden">
          <NavLinks
            className="flex flex-col gap-2"
            onNavigate={() => setOpen(false)}
            showAdminLink={showAdminLink}
          />
        </nav>
      )}
    </>
  )
}
