'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';
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
  const baseLink =
    linkClassName ||
    'rounded-md px-3 py-2 text-sm font-medium transition-colors ' +
      'hover:bg-secondary hover:text-foreground ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
      'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  const items = categories
    .map(category => ({
      ...category,
      slug: slugify(category.title || ''),
      displayTitle: category.title === 'Growth' ? 'Career' : category.title,
    }))
    .filter(category => category.slug);

  return (
    <nav
      className={cn('flex items-center gap-1', className)}
      aria-label="Blog categories"
    >
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={pathname === '/' ? 'page' : undefined}
        className={cn(
          baseLink,
          pathname === '/'
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground'
        )}
      >
        {tNav('home')}
      </Link>
      {items.map(category => {
        const href = `/blog/category/${category.slug}`;
        const isActive = pathname === href;
        return (
          <Link
            key={category._id}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              baseLink,
              isActive ? 'bg-muted text-foreground' : 'text-muted-foreground'
            )}
          >
            {getCategoryLabel(category.displayTitle)}
          </Link>
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
