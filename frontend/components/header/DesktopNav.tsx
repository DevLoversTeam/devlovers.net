'use client';

import { BookOpen, ShoppingBag } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BlogCategoryLinks } from '@/components/blog/BlogCategoryLinks';
import { NavLink } from '@/components/header/NavLink';
import { HeaderButton } from '@/components/shared/HeaderButton';
import { NavLinks } from '@/components/shop/header/NavLinks';
import { SITE_LINKS } from '@/lib/navigation';

import { useMobileMenu } from './MobileMenuContext';

type Category = {
  _id: string;
  title: string;
};

type DesktopNavProps = {
  variant: 'platform' | 'shop' | 'blog';
  blogCategories?: Category[];
};

export function DesktopNav({ variant, blogCategories = [] }: DesktopNavProps) {
  const t = useTranslations('navigation');
  const { startNavigation } = useMobileMenu();

  const handleShopClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    startNavigation('/shop');
  };

  if (variant === 'shop') {
    return <NavLinks className="lg:flex" includeHomeLink />;
  }

  if (variant === 'blog') {
    return <BlogCategoryLinks categories={blogCategories} />;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {SITE_LINKS.filter(
          link => link.href !== '/shop' && link.href !== '/blog'
        ).map(link => (
          <NavLink key={link.href} href={link.href}>
            {t(link.labelKey)}
          </NavLink>
        ))}
      </div>

      <HeaderButton href="/blog" icon={BookOpen} showArrow>
        {t('blog')}
      </HeaderButton>

      <HeaderButton
        href="/shop"
        icon={ShoppingBag}
        showArrow
        onLinkClick={handleShopClick}
      >
        {t('shop')}
      </HeaderButton>
    </div>
  );
}
