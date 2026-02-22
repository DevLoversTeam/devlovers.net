'use client';

import { BookOpen, LogIn, Menu, ShoppingBag, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

import { LogoutButton } from '@/components/auth/logoutButton';
import { useMobileMenu } from '@/components/header/MobileMenuContext';
import { HeaderButton } from '@/components/shared/HeaderButton';
import { Link, usePathname } from '@/i18n/routing';
import { SITE_LINKS } from '@/lib/navigation';

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
  const tAria = useTranslations('aria');
  const tMobileMenu = useTranslations('mobileMenu');
  const tCategories = useTranslations('shop.catalog.categories');
  const tProducts = useTranslations('shop.products');
  const tBlog = useTranslations('blog');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    isOpen: open,
    isAnimating,
    close,
    toggle,
    startNavigation,
  } = useMobileMenu();

  const currentCategory = searchParams.get('category');

  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    startNavigation(href);
  };

  const handleHeaderButtonLinkClick =
    (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      startNavigation(href);
    };

  const getBlogCategoryLabel = (categoryName: string): string => {
    const key = categoryName.toLowerCase() as
      | 'tech'
      | 'career'
      | 'insights'
      | 'news'
      | 'growth';
    const translations: Record<string, string> = {
      tech: tBlog('categories.tech'),
      career: tBlog('categories.career'),
      insights: tBlog('categories.insights'),
      news: tBlog('categories.news'),
      growth: tBlog('categories.growth'),
    };
    return translations[key] || categoryName;
  };

  const shopLinks = useMemo(
    () => [
      { href: '/shop/products', label: tProducts('title'), category: null },
      {
        href: '/shop/products?category=apparel',
        label: tCategories('apparel'),
        category: 'apparel',
      },
      {
        href: '/shop/products?category=lifestyle',
        label: tCategories('lifestyle'),
        category: 'lifestyle',
      },
      {
        href: '/shop/products?category=collectibles',
        label: tCategories('collectibles'),
        category: 'collectibles',
      },
    ],
    [tProducts, tCategories]
  );

  const links = useMemo(() => {
    if (variant === 'shop') return shopLinks;
    if (variant === 'platform') return SITE_LINKS;
    return [];
  }, [variant, shopLinks]);

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');

  const linkClass = (isActive: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'text-[var(--accent-primary)]'
        : 'text-muted-foreground active:text-[var(--accent-hover)]'
    }`;

  // Lock body scroll when menu is open.
  // overflow:hidden on <html> works on desktop but iOS Safari ignores it for
  // touch events. Adding a non-passive touchmove listener lets us call
  // preventDefault() to block background scrolling while still allowing the
  // nav itself (which has overflow-y-auto) to scroll normally.
  useEffect(() => {
    if (!open) return;

    const prev = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'hidden';

    const preventTouchMove = (e: TouchEvent) => {
      const nav = document.getElementById('app-mobile-nav');
      if (nav && nav.contains(e.target as Node)) return;
      e.preventDefault();
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    return () => {
      document.documentElement.style.overflowY = prev;
      document.removeEventListener('touchmove', preventTouchMove);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="focus-visible:ring-accent-primary flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2"
        style={{
          color: open ? 'var(--accent-primary)' : 'var(--muted-foreground)',
        }}
        aria-label={tAria('toggleMenu')}
        aria-expanded={open}
        aria-controls={open ? 'app-mobile-nav' : undefined}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <>
          <div
            className={`fixed inset-x-0 top-16 bottom-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 min-[1050px]:hidden ${
              isAnimating ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={close}
            aria-hidden="true"
          />

          <nav
            id="app-mobile-nav"
            className={`bg-background fixed top-16 right-0 left-0 z-50 h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain px-4 py-4 transition-transform duration-300 ease-out sm:px-6 min-[1050px]:hidden ${
              isAnimating ? 'translate-y-0' : '-translate-y-4'
            }`}
            style={{
              opacity: isAnimating ? 1 : 0,
              transition: 'transform 300ms ease-out, opacity 200ms ease-out',
            }}
          >
            <div className="flex flex-col gap-1">
              {variant === 'shop' && (
                <>
                  <HeaderButton
                    href="/shop"
                    icon={ShoppingBag}
                    isActive={pathname === '/shop'}
                    onLinkClick={handleHeaderButtonLinkClick('/shop')}
                  >
                    {t('shop')}
                  </HeaderButton>
                  {links.map(link => {
                    const isActive =
                      pathname === '/shop/products' &&
                      ('category' in link
                        ? link.category === currentCategory
                        : currentCategory === null);

                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={e => handleLinkClick(e, link.href)}
                        className={linkClass(isActive)}
                      >
                        {'labelKey' in link ? t(link.labelKey) : link.label}
                      </Link>
                    );
                  })}
                </>
              )}

              {variant === 'blog' && (
                <>
                  <HeaderButton
                    href="/blog"
                    icon={BookOpen}
                    isActive={pathname === '/blog'}
                    onLinkClick={handleHeaderButtonLinkClick('/blog')}
                  >
                    {t('blog')}
                  </HeaderButton>
                  {blogCategories.map(category => {
                    const slug = slugify(category.title || '');
                    const href = `/blog/category/${slug}`;
                    const isActive = pathname === href;
                    const displayTitle =
                      category.title === 'Growth' ? 'Career' : category.title;

                    return (
                      <Link
                        key={category._id}
                        href={href}
                        onClick={e => handleLinkClick(e, href)}
                        className={linkClass(isActive)}
                      >
                        {getBlogCategoryLabel(displayTitle)}
                      </Link>
                    );
                  })}
                </>
              )}

              {variant === 'platform' && (
                <>
                  {links
                    .filter(
                      link => link.href !== '/shop' && link.href !== '/blog'
                    )
                    .map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={e => handleLinkClick(e, link.href)}
                        className={linkClass(pathname === link.href)}
                      >
                        {'labelKey' in link ? t(link.labelKey) : link.label}
                      </Link>
                    ))}

                  <HeaderButton
                    href="/blog"
                    icon={BookOpen}
                    showArrow
                    onLinkClick={handleHeaderButtonLinkClick('/blog')}
                  >
                    {t('blog')}
                  </HeaderButton>

                  <HeaderButton
                    href="/shop"
                    icon={ShoppingBag}
                    showArrow
                    onLinkClick={handleHeaderButtonLinkClick('/shop')}
                  >
                    {t('shop')}
                  </HeaderButton>
                </>
              )}

              {variant === 'shop' && showAdminLink && (
                <Link
                  href="/admin/shop/products/new"
                  onClick={e => handleLinkClick(e, '/admin/shop/products/new')}
                  className={linkClass(pathname === '/admin/shop/products/new')}
                >
                  {tMobileMenu('newProduct')}
                </Link>
              )}

              <div className="bg-border my-2 h-px" />

              {userExists ? (
                <>
                  <Link
                    href="/dashboard"
                    onClick={e => handleLinkClick(e, '/dashboard')}
                    className={linkClass(pathname === '/dashboard')}
                  >
                    {t('dashboard')}
                  </Link>

                  {showAdminLink && (
                    <Link
                      href="/admin"
                      aria-label={tAria('admin')}
                      title={tAria('admin')}
                      onClick={e => handleLinkClick(e, '/admin')}
                      className={linkClass(pathname === '/admin')}
                    >
                      {tMobileMenu('admin')}
                    </Link>
                  )}

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