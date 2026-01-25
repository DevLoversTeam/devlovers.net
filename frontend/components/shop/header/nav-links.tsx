'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Home } from 'lucide-react';

import { usePathname } from '@/i18n/routing';
import { CATEGORIES } from '@/lib/config/catalog';
import { cn } from '@/lib/utils';
import { AnimatedNavLink } from '@/components/shared/AnimatedNavLink';
import { HeaderButton } from '@/components/shared/HeaderButton';

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
  const isHomeActive = pathname.startsWith('/shop');

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
      className={cn('flex items-center gap-2', className)}
    >
      <ul className="flex items-center gap-2">
        {includeHomeLink ? (
          <li>
            <HeaderButton
              href="/"
              onClick={onNavigate}
              icon={Home}
              className={cn(isHomeActive && '[color:var(--accent-primary)]')}
            >
              Home
            </HeaderButton>
          </li>
        ) : null}

        {computed.map(link => (
          <li key={link.href}>
            <AnimatedNavLink
              href={link.href}
              isActive={link.isActive}
              onClick={onNavigate}
            >
              {link.label}
            </AnimatedNavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { NAV_LINKS };
