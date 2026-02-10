'use client';

import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useMobileMenu } from '@/components/header/MobileMenuContext';
import { AnimatedNavLink } from '@/components/shared/AnimatedNavLink';
import { HeaderButton } from '@/components/shared/HeaderButton';
import { usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type Category = {
  _id: string;
  title: string;
};

type BlogCategoryLinksProps = {
  categories: Category[];
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
};

export function BlogCategoryLinks({
  categories,
  className,
  linkClassName,
  onNavigate,
}: BlogCategoryLinksProps) {
  const t = useTranslations('blog');
  const tNav = useTranslations('navigation');
  const pathname = usePathname();
  const { startNavigation } = useMobileMenu();

  const getCategoryLabel = (categoryName: string): string => {
    const key = categoryName.toLowerCase() as
      | 'tech'
      | 'career'
      | 'insights'
      | 'news'
      | 'growth';
    const categoryTranslations: Record<string, string> = {
      tech: t('categories.tech'),
      career: t('categories.career'),
      insights: t('categories.insights'),
      news: t('categories.news'),
      growth: t('categories.growth'),
    };
    return categoryTranslations[key] || categoryName;
  };

  const items = categories
    .map(category => ({
      ...category,
      slug: slugify(category.title || ''),
      displayTitle: category.title === 'Growth' ? 'Career' : category.title,
    }))
    .filter(category => category.slug);

  return (
    <nav
      className={cn('flex items-center gap-2', className)}
      aria-label="Blog categories"
    >
      <HeaderButton
        href="/blog"
        onLinkClick={e => {
          e.preventDefault();
          if (onNavigate) onNavigate();
          startNavigation('/blog');
        }}
        icon={BookOpen}
        isActive={pathname === '/blog'}
      >
        {tNav('blog')}
      </HeaderButton>

      {items.map(category => {
        const href = `/blog/category/${category.slug}`;
        const isActive = pathname === href;
        return (
          <AnimatedNavLink
            key={category._id}
            href={href}
            isActive={isActive}
            onClick={onNavigate}
            className={linkClassName}
          >
            {getCategoryLabel(category.displayTitle)}
          </AnimatedNavLink>
        );
      })}
    </nav>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}
