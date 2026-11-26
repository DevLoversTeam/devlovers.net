'use client';

import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useMobileMenu } from '@/components/header/MobileMenuContext';
import { AnimatedNavLink } from '@/components/shared/AnimatedNavLink';
import { HeaderButton } from '@/components/shared/HeaderButton';
import { usePathname } from '@/i18n/routing';
import { getBlogCategoryLabel } from '@/lib/blog/category-label';
import { cn } from '@/lib/utils';

type Category = {
  id: string;
  slug: string;
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

  const items = categories.filter(category => category.slug);

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
            key={category.id}
            href={href}
            isActive={isActive}
            onClick={onNavigate}
            className={linkClassName}
          >
            {getBlogCategoryLabel(category.title, t)}
          </AnimatedNavLink>
        );
      })}
    </nav>
  );
}
