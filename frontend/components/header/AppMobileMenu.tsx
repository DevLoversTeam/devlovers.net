'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/i18n/routing';

import { SITE_LINKS } from '@/lib/navigation';
import { NAV_LINKS } from '@/components/shop/header/nav-links';
import { BlogCategoryLinks } from '@/components/blog/BlogCategoryLinks';
import { LogoutButton } from '@/components/auth/logoutButton';

export type AppMobileMenuVariant = 'platform' | 'shop' | 'blog';

type Props = {
  variant: AppMobileMenuVariant;
  userExists: boolean;
  showAdminLink?: boolean;
  blogCategories?: Array<{ _id: string; title: string }>;
};

export function AppMobileMenu({
  variant,
  userExists,
  showAdminLink = false,
  blogCategories = [],
}: Props) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  const toggle = () => setOpen(prev => !prev);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const links = useMemo(() => {
    if (variant === 'shop') return NAV_LINKS;
    if (variant === 'platform') return SITE_LINKS;
    return [];
  }, [variant]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Toggle menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls="app-mobile-nav"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 md:hidden"
            onClick={close}
          />

          <nav
            id="app-mobile-nav"
            className="fixed left-0 right-0 top-16 z-50 border-t border-border bg-background px-4 py-4 md:hidden"
          >
            <div className="flex flex-col gap-1">
              {variant === 'shop' ? (
                <Link
                  href="/"
                  onClick={close}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Home
                </Link>
              ) : null}

              {variant === 'blog' ? (
                <BlogCategoryLinks
                  categories={blogCategories}
                  className="flex flex-col gap-1"
                  linkClassName="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  onNavigate={close}
                />
              ) : (
                links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={close}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ))
              )}

              {variant === 'shop' && showAdminLink ? (
                <Link
                  href="/shop/admin/products/new"
                  onClick={close}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  New product
                </Link>
              ) : null}

              <div className="my-2 h-px bg-border" />

              {userExists ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={close}
                    className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Dashboard
                  </Link>

                  {showAdminLink ? (
                    <Link
                      href="/shop/admin"
                      aria-label="Shop admin"
                      title="Shop admin"
                      className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      Admin
                    </Link>
                  ) : null}

                  {/* LogoutButton стилізується сам; ми тільки позиціонуємо як пункт меню */}
                  <div className="px-3 py-2" onClick={close}>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={close}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Log in
                </Link>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
