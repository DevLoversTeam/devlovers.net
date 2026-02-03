'use client';

import { Home } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { AnimatedNavLink } from '@/components/shared/AnimatedNavLink';
import { HeaderButton } from '@/components/shared/HeaderButton';
import { usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

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
  const t = useTranslations('shop.catalog.categories');
  const tProducts = useTranslations('shop.products');
  const tNav = useTranslations('shop.admin.navigation');

  const navLinks = useMemo(
    () => [
      { href: '/shop/products', label: tProducts('title'), slug: 'all' },
      {
        href: '/shop/products?category=apparel',
        label: t('apparel'),
        slug: 'apparel',
      },
      {
        href: '/shop/products?category=lifestyle',
        label: t('lifestyle'),
        slug: 'lifestyle',
      },
      {
        href: '/shop/products?category=collectibles',
        label: t('collectibles'),
        slug: 'collectibles',
      },
    ],
    [t, tProducts]
  );

  const computed = useMemo(() => {
    return navLinks.map(link => {
      const linkPath = link.href.split('?')[0] ?? link.href;
      const linkCategory = getLinkCategory(link.href);

      const isActive =
        pathname === linkPath &&
        (linkCategory ? currentCategory === linkCategory : !currentCategory);

      return { ...link, isActive };
    });
  }, [pathname, currentCategory, navLinks]);

  return (
    <nav
      aria-label={tNav('shopNav')}
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
              {tNav('home')}
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
