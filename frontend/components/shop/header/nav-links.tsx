'use client';

import { Link, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';

import { CATEGORIES } from '@/lib/config/catalog';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/shop/products', label: 'All Products' },
  {
    href: '/shop/products?category=apparel',
    label: CATEGORIES.find(category => category.slug === 'apparel')?.label ?? 'Apparel',
  },
  {
    href: '/shop/products?category=lifestyle',
    label: CATEGORIES.find(category => category.slug === 'lifestyle')?.label ?? 'Lifestyle',
  },
  {
    href: '/shop/products?category=collectibles',
    label: CATEGORIES.find(category => category.slug === 'collectibles')?.label ?? 'Collectibles',
  },
] as const;

interface NavLinksProps {
  className?: string;
  onNavigate?: () => void;
  showAdminLink?: boolean;
}

export function NavLinks({ className, onNavigate, showAdminLink = false }: NavLinksProps) {
  const pathname = usePathname(); // i18n-aware (без /{locale} префіксу)
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category');

  return (
    <nav className={cn('items-center gap-1', className)}>
      {NAV_LINKS.map(link => {
        const [linkPath, linkQuery] = link.href.split('?');
        const linkParams = new URLSearchParams(linkQuery ?? '');
        const linkCategory = linkParams.get('category');

        // Правило:
        // - "All Products" активний тільки коли немає category в URL
        // - category-лінк активний тільки коли category збігається
        const isActive =
          pathname === linkPath &&
          (linkCategory ? currentCategory === linkCategory : !currentCategory);

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors hover:text-foreground',
              isActive ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        );
      })}

      {showAdminLink ? (
        <Link
          href="/shop/admin/products/new"
          onClick={onNavigate}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          New product
        </Link>
      ) : null}
    </nav>
  );
}

export { NAV_LINKS };
