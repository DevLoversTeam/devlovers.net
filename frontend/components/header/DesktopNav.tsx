'use client';

import { useTranslations } from 'next-intl';

import { BlogCategoryLinks } from '@/components/blog/BlogCategoryLinks';
import { NavLink } from '@/components/header/NavLink';
import { NavLinks } from '@/components/shop/header/NavLinks';
import { SITE_LINKS } from '@/lib/navigation';

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

  if (variant === 'shop') {
    return <NavLinks className="min-[1050px]:flex" includeHomeLink />;
  }

  if (variant === 'blog') {
    return <BlogCategoryLinks categories={blogCategories} />;
  }

  return (
    <div className="flex items-center gap-1">
      {SITE_LINKS.map(link => (
        <NavLink key={link.href} href={link.href}>
          {t(link.labelKey)}
        </NavLink>
      ))}
    </div>
  );
}
