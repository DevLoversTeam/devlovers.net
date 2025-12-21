'use client';

import { LogIn } from 'lucide-react';
import { Link } from '@/i18n/routing';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { ThemeToggleButton } from '@/components/shop/header/theme-toggle';
import { LogoutButton } from '@/components/auth/logoutButton';
import SiteMobileHeader from '@/components/header/SiteMobileHeader';

type SiteHeaderProps = {
  userExists: boolean;
};

const SITE_LINKS = [
  { href: '/q&a', label: 'Q&A' },
  { href: '/quiz/react-fundamentals', label: 'Quiz' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/shop', label: 'Shop' },
] as const;

export default function SiteHeader({ userExists }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold tracking-tight">DevLovers</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {SITE_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-2 md:flex">
            <ThemeToggleButton />
            <LanguageSwitcher />

            {!userExists ? (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-foreground transition-colors hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Log in
              </Link>
            ) : (
              <LogoutButton />
            )}
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggleButton />
            <LanguageSwitcher />

            {!userExists ? (
              <Link
                href="/login"
                aria-label="Log in"
                className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <LogIn className="h-5 w-5" />
              </Link>
            ) : (
              <LogoutButton iconOnly />
            )}

            <SiteMobileHeader />
          </div>
        </div>
      </div>
    </header>
  );
}
