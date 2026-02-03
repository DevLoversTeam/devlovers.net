'use client';

import { ChevronDown } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useRouter } from '@/i18n/routing';
import { SORT_OPTIONS } from '@/lib/config/catalog';
import {
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_SELECT_BASE,
  SHOP_SELECT_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

type ProductSortProps = {
  className?: string;
};

export function ProductSort({ className }: ProductSortProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('shop.sort');
  const tOptions = useTranslations('shop.catalog.sort');

  const basePath = '/shop/products';

  const currentSort = searchParams.get('sort') || 'featured';
  const isActive = currentSort !== 'featured';

  const selectId = useId();

  const getOptionLabel = (value: string) => {
    const keyMap: Record<string, string> = {
      featured: 'featured',
      'price-asc': 'priceAsc',
      'price-desc': 'priceDesc',
      newest: 'newest',
    };
    return tOptions(keyMap[value] || 'featured');
  };

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
      aria-label={t('label')}
    >
      <label htmlFor={selectId} className="text-muted-foreground text-sm">
        {t('sortBy')}
      </label>

      <div className="relative w-full sm:w-52">
        <select
          id={selectId}
          name="sort"
          value={currentSort}
          onChange={e => handleSort(e.target.value)}
          className={cn(
            SHOP_SELECT_BASE,
            SHOP_SELECT_INTERACTIVE,
            SHOP_FOCUS,
            SHOP_DISABLED,
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {SORT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {getOptionLabel(option.value)}
            </option>
          ))}
        </select>

        <ChevronDown
          className={cn(
            'pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2',
            'text-muted-foreground transition-colors',
            'peer-hover:text-foreground peer-focus-visible:text-foreground'
          )}
          aria-hidden="true"
        />
      </div>
    </form>
  );
}
