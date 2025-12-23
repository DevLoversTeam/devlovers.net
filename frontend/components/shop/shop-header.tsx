'use client';

import Link from 'next/link';
import { Search, User, Home } from 'lucide-react';
import { CartButton } from './header/cart-button';
import { MobileNav } from './header/mobile-nav';
import { NavLinks } from './header/nav-links';
import { ThemeToggleButton } from './header/theme-toggle';

interface HeaderProps {
  showAdminLink?: boolean;
}

export function Header({ showAdminLink = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {/* Back to main platform */}
          <Link
            href="/"
            aria-label="Back to main site"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Home className="h-5 w-5" />
          </Link>

          {/* Shop brand */}
          <Link href="/shop" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">DevLovers</span>
            <span className="hidden rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline">
              Shop
            </span>
          </Link>
        </div>

        <NavLinks className="hidden md:flex" showAdminLink={showAdminLink} />

        <div className="flex items-center gap-1">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Account"
          >
            <User className="h-5 w-5" />
          </button>

          <CartButton />
          <ThemeToggleButton />
          <MobileNav showAdminLink={showAdminLink} />
        </div>
      </div>
    </header>
  );
}
