'use client';

import { Menu, X, LogIn, ShoppingBag, Home } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

import { SITE_LINKS } from '@/lib/navigation';
import { NAV_LINKS } from '@/components/shop/header/nav-links';
import { LogoutButton } from '@/components/auth/logoutButton';
import { HeaderButton } from '@/components/shared/HeaderButton';

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
  const t = useTranslations('navigation');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const close = () => {
    setIsAnimating(false);
    setTimeout(() => setOpen(false), 200);
  };

  const toggle = () => {
    if (open) {
      close();
    } else {
      setOpen(true);
      setTimeout(() => setIsAnimating(true), 10);
    }
  };

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

  useEffect(() => {
    if (open) {
      const scrollY = window.scrollY;

      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';

        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);

  const linkClass = (isActive: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'text-[var(--accent-primary)]'
        : 'text-muted-foreground active:text-[var(--accent-hover)]'
    }`;

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        style={{
          color: open ? 'var(--accent-primary)' : 'var(--muted-foreground)',
        }}
        aria-label="Toggle menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? 'app-mobile-nav' : undefined}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <div
            className={`fixed inset-x-0 top-16 bottom-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity duration-200 ${
              isAnimating ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={close}
            aria-hidden="true"
          />

          <nav
            id="app-mobile-nav"
            className={`fixed left-0 right-0 top-16 z-50 h-[calc(100dvh-4rem)] overflow-y-auto bg-background px-4 sm:px-6 lg:px-8 py-4 lg:hidden overscroll-contain transition-transform duration-300 ease-out ${
              isAnimating ? 'translate-y-0' : '-translate-y-4'
            }`}
            style={{
              opacity: isAnimating ? 1 : 0,
              transition: 'transform 300ms ease-out, opacity 200ms ease-out',
            }}
          >
            <div className="flex flex-col gap-1">
              {variant === 'shop' ? (
                <>
                  <HeaderButton href="/" icon={Home} onClick={close}>
                    {t('home')}
                  </HeaderButton>
                  {links.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={close}
                      className={linkClass(pathname === link.href)}
                    >
                      {'labelKey' in link ? t(link.labelKey) : link.label}
                    </Link>
                  ))}
                </>
              ) : null}

              {variant === 'blog' ? (
                <>
                  <HeaderButton href="/" icon={Home} onClick={close}>
                    {t('home')}
                  </HeaderButton>
                  {blogCategories.map(category => {
                    const slug = slugify(category.title || '');
                    const href = `/blog/category/${slug}`;
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={category._id}
                        href={href}
                        onClick={close}
                        className={linkClass(isActive)}
                      >
                        {category.title}
                      </Link>
                    );
                  })}
                </>
              ) : null}

              {variant === 'platform' ? (
                <>
                  {links
                    .filter(link => link.href !== '/shop')
                    .map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={close}
                        className={linkClass(pathname === link.href)}
                      >
                        {'labelKey' in link ? t(link.labelKey) : link.label}
                      </Link>
                    ))}

                  <HeaderButton
                    href="/shop"
                    icon={ShoppingBag}
                    showArrow
                    onClick={close}
                  >
                    {t('shop')}
                  </HeaderButton>
                </>
              ) : null}

              {variant === 'shop' && showAdminLink ? (
                <Link
                  href="/shop/admin/products/new"
                  onClick={close}
                  className={linkClass(pathname === '/shop/admin/products/new')}
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
                    className={linkClass(pathname === '/dashboard')}
                  >
                    {t('dashboard')}
                  </Link>

                  {showAdminLink ? (
                    <Link
                      href="/shop/admin"
                      aria-label="Shop admin"
                      title="Shop admin"
                      onClick={close}
                      className={linkClass(pathname === '/shop/admin')}
                    >
                      Admin
                    </Link>
                  ) : null}

                  <div onClick={close}>
                    <LogoutButton />
                  </div>
                </>
              ) : (
                <HeaderButton href="/login" icon={LogIn} onClick={close}>
                  {t('login')}
                </HeaderButton>
              )}
            </div>
          </nav>
        </>
      )}
    </>
  );
}
