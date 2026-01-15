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
  includeHomeLink?: boolean; // NEW
}

export function NavLinks({
  className,
  onNavigate,
  showAdminLink = false,
  includeHomeLink = false,
}: NavLinksProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category');

  const baseLink =
    'rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
    'hover:bg-muted/50 hover:text-foreground ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  const isHomeActive = pathname === '/';

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label="Shop categories">
      {includeHomeLink ? (
        <Link
          href="/"
          onClick={onNavigate}
          aria-current={isHomeActive ? 'page' : undefined}
          className={cn(
            baseLink,
            isHomeActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
          )}
        >
          Home
        </Link>
      ) : null}

      {NAV_LINKS.map(link => {
        const [linkPath, linkQuery] = link.href.split('?');
        const linkParams = new URLSearchParams(linkQuery ?? '');
        const linkCategory = linkParams.get('category');

        const isActive =
          pathname === linkPath &&
          (linkCategory ? currentCategory === linkCategory : !currentCategory);

        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              baseLink,
              isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
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
          className={cn(baseLink, 'text-muted-foreground')}
        >
          New product
        </Link>
      ) : null}
    </nav>
  );
}

export { NAV_LINKS };
