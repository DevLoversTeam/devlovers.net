'use client';

import groq from 'groq';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { client } from '@/client';
import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type Category = {
  _id: string;
  title: string;
};

const categoriesQuery = groq`
  *[_type == "category"] | order(orderRank asc) {
    _id,
    title
  }
`;

type BlogNavLinksProps = {
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
};

export function BlogNavLinks({
  className,
  linkClassName,
  onNavigate,
}: BlogNavLinksProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category');

  useEffect(() => {
    let active = true;
    client
      .fetch<Category[]>(categoriesQuery)
      .then(result => {
        if (!active) return;
        setCategories(result || []);
      })
      .catch(() => {
        if (!active) return;
        setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const baseLink =
    linkClassName ||
    'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary hover:text-foreground';

  const containerClassName = cn('flex items-center gap-1', className);
  const isBlogPath = pathname.startsWith('/blog');

  const items = useMemo(() => {
    return categories
      .filter(category => category.title)
      .map(category => ({
        ...category,
        isActive: isBlogPath && currentCategory === category.title,
      }));
  }, [categories, currentCategory, isBlogPath]);

  if (!items.length) return null;

  return (
    <nav className={containerClassName} aria-label="Blog categories">
      {items.map(category => (
        <Link
          key={category._id}
          href={`/blog?category=${encodeURIComponent(category.title)}`}
          onClick={onNavigate}
          aria-current={category.isActive ? 'page' : undefined}
          className={cn(
            baseLink,
            category.isActive
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground'
          )}
        >
          {category.title}
        </Link>
      ))}
    </nav>
  );
}
