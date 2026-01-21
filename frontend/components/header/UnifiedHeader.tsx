'use client';
import { LogIn, Settings, User } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { SITE_LINKS } from '@/lib/navigation';

import LanguageSwitcher from '@/components/shared/LanguageSwitcher';
import { LogoutButton } from '@/components/auth/logoutButton';

import { CartButton } from '@/components/shop/header/cart-button';
import { NavLinks } from '@/components/shop/header/nav-links';
import { BlogCategoryLinks } from '@/components/blog/BlogCategoryLinks';
import { BlogHeaderSearch } from '@/components/blog/BlogHeaderSearch';
import { AppMobileMenu } from '@/components/header/AppMobileMenu';

export type UnifiedHeaderVariant = 'platform' | 'shop' | 'blog';

export type UnifiedHeaderProps = {
  variant: UnifiedHeaderVariant;
  userExists: boolean;
  showAdminLink?: boolean;
  enableSearch?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
};

export function UnifiedHeader({
  variant,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: UnifiedHeaderProps) {
  const isShop = variant === 'shop';
  const isBlog = variant === 'blog';
  const brandHref = isShop ? '/shop' : isBlog ? '/blog' : '/';
  const brandBadge = isShop ? 'Shop' : isBlog ? 'Blog' : '';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={brandHref} className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xl font-bold tracking-tight">
              DevLovers
            </span>
            <span
              className={[
                'hidden rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline',
                brandBadge ? '' : 'invisible',
              ].join(' ')}
              aria-hidden={!brandBadge}
            >
              {brandBadge}
            </span>
          </Link>
        </div>

        <nav
          className="hidden items-center justify-center md:flex"
          aria-label="Primary"
        >
          {isShop ? (
            <NavLinks className="md:flex" includeHomeLink />
          ) : isBlog ? (
            <BlogCategoryLinks categories={blogCategories} />
          ) : (
            <div className="flex items-center gap-1">
              {SITE_LINKS.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="flex items-center gap-1">
          <div className="hidden items-center gap-2 md:flex">
            {userExists && (
              <Link
                href="/dashboard"
                aria-label="Dashboard"
                title="Dashboard"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <User className="h-5 w-5" />
              </Link>
            )}
            {showAdminLink ? (
              <Link
                href="/shop/admin"
                aria-label="Shop admin"
                title="Shop admin"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </Link>
            ) : null}

            {isBlog && <BlogHeaderSearch />}
            <LanguageSwitcher />
            {isShop && <CartButton />}

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
            {isBlog && <BlogHeaderSearch />}
            <LanguageSwitcher />
            {isShop && <CartButton />}
            <AppMobileMenu
              variant={isShop ? 'shop' : isBlog ? 'blog' : 'platform'}
              userExists={userExists}
              showAdminLink={showAdminLink}
              blogCategories={blogCategories}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
