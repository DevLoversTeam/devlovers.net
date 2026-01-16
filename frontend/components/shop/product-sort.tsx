// frontend/components/shop/product-sort.tsx

'use client';

import { useId } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { SORT_OPTIONS } from '@/lib/config/catalog';
import { cn } from '@/lib/utils';

type ProductSortProps = {
  className?: string;
};

export function ProductSort({ className }: ProductSortProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const basePath = `/${locale}/shop/products`;

  const currentSort = searchParams.get('sort') || 'featured';
  const isActive = currentSort !== 'featured';

  const selectId = useId();

  const handleSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');

    if (value === 'featured') {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }

    const queryString = params.toString();
    router.push(queryString ? `${basePath}?${queryString}` : basePath);
  };

  return (
    <form
      className={cn(
        'flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2',
        className
      )}
      aria-label="Sort products"
    >
      <label htmlFor={selectId} className="text-sm text-muted-foreground">
        Sort by:
      </label>

      <select
        id={selectId}
        name="sort"
        value={currentSort}
        onChange={e => handleSort(e.target.value)}
        className={[
          'h-10 w-full rounded-md border border-input px-3 text-sm transition-colors sm:w-48',
          isActive
            ? 'bg-muted text-foreground'
            : 'bg-background text-muted-foreground',
          'hover:text-foreground',
          'focus:outline-none focus:ring-0 focus:ring-offset-0',
        ].join(' ')}
      >
        {SORT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}
