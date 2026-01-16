// C:\Users\milka\devlovers.net-clean\frontend\components\shop\header\nav-links.tsx

'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import { Link, usePathname } from '@/i18n/routing';
import { CATEGORIES } from '@/lib/config/catalog';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/shop/products', label: 'All Products' },
  {
    href: '/shop/products?category=apparel',
    label:
      CATEGORIES.find(category => category.slug === 'apparel')?.label ??
      'Apparel',
  },
  {
    href: '/shop/products?category=lifestyle',
    label:
      CATEGORIES.find(category => category.slug === 'lifestyle')?.label ??
      'Lifestyle',
  },
  {
    href: '/shop/products?category=collectibles',
    label:
      CATEGORIES.find(category => category.slug === 'collectibles')?.label ??
      'Collectibles',
  },
] as const;

interface NavLinksProps {
  className?: string;
  onNavigate?: () => void;
  showAdminLink?: boolean;
  includeHomeLink?: boolean;
}

function getLinkCategory(href: string): string | null {
  const [, query] = href.split('?');
  if (!query) return null;
  const params = new URLSearchParams(query);
  return params.get('category');
}

export function NavLinks({
  className,
  onNavigate,
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

  const computed = useMemo(() => {
    return NAV_LINKS.map(link => {
      const linkPath = link.href.split('?')[0] ?? link.href;
      const linkCategory = getLinkCategory(link.href);

      const isActive =
        pathname === linkPath &&
        (linkCategory ? currentCategory === linkCategory : !currentCategory);

      return { ...link, isActive };
    });
  }, [pathname, currentCategory]);

  return (
    <nav
      aria-label="Shop navigation"
      className={cn('flex items-center gap-1', className)}
    >
      <ul className="flex items-center gap-1">
        {includeHomeLink ? (
          <li>
            <Link
              href="/"
              onClick={onNavigate}
              aria-current={isHomeActive ? 'page' : undefined}
              className={cn(
                baseLink,
                isHomeActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              Home
            </Link>
          </li>
        ) : null}

        {computed.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={link.isActive ? 'page' : undefined}
              className={cn(
                baseLink,
                link.isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { NAV_LINKS };
