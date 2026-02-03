'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { CATEGORIES, COLORS, PRODUCT_TYPES, SIZES } from '@/lib/config/catalog';
import {
  SHOP_CHIP_BORDER_HOVER,
  SHOP_CHIP_HOVER,
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SELECTED,
  SHOP_FILTER_ITEM_BASE,
  SHOP_FOCUS,
  SHOP_SIZE_CHIP_BASE,
  SHOP_SWATCH_BASE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

export function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('shop.filters');
  const tCategories = useTranslations('shop.catalog.categories');
  const tTypes = useTranslations('shop.catalog.productTypes');
  const tColors = useTranslations('shop.catalog.colors');
  const currentCategory = searchParams.get('category') || 'all';
  const currentType = searchParams.get('type');
  const currentColor = searchParams.get('color');
  const currentSize = searchParams.get('size');

  const categoryGroupId = useId();
  const typeGroupId = useId();
  const colorGroupId = useId();
  const sizeGroupId = useId();

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');

    if (value && value !== 'all') params.set(key, value);
    else params.delete(key);

    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return (
    <aside className="space-y-8" aria-label={t('label')}>
      {/* Category */}
      <section aria-labelledby={categoryGroupId}>
        <h3
          id={categoryGroupId}
          className="text-foreground text-sm font-semibold tracking-wide uppercase"
        >
          {t('category')}
        </h3>

        <ul className="mt-4 space-y-2" role="list">
          {CATEGORIES.map(cat => (
            <li key={cat.slug}>
              <button
                type="button"
                onClick={() => updateFilter('category', cat.slug)}
                aria-current={currentCategory === cat.slug ? 'true' : undefined}
                className={cn(
                  SHOP_FILTER_ITEM_BASE,
                  SHOP_FOCUS,
                  currentCategory === cat.slug
                    ? 'text-accent'
                    : 'text-muted-foreground hover:text-accent active:text-accent'
                )}
              >
                {tCategories(
                  cat.slug === 'new-arrivals'
                    ? 'newArrivals'
                    : cat.slug === 'best-sellers'
                      ? 'bestSellers'
                      : cat.slug
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={typeGroupId}>
        <h3
          id={typeGroupId}
          className="text-foreground text-sm font-semibold tracking-wide uppercase"
        >
          {t('type')}
        </h3>

        <ul className="mt-4 space-y-2" role="list">
          {PRODUCT_TYPES.map(type => {
            const isSelected = currentType === type.slug;

            return (
              <li key={type.slug}>
                <button
                  type="button"
                  onClick={() =>
                    updateFilter('type', isSelected ? null : type.slug)
                  }
                  aria-pressed={isSelected}
                  className={cn(
                    SHOP_FILTER_ITEM_BASE,
                    SHOP_FOCUS,
                    isSelected
                      ? 'text-accent'
                      : 'text-muted-foreground hover:text-accent active:text-accent'
                  )}
                >
                  {tTypes(type.slug)}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby={colorGroupId}>
        <h3
          id={colorGroupId}
          className="text-foreground text-sm font-semibold tracking-wide uppercase"
        >
          {t('color')}
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          {COLORS.map(color => {
            const isSelected = currentColor === color.slug;
            const colorLabel = tColors(color.slug);

            return (
              <button
                key={color.slug}
                type="button"
                onClick={() =>
                  updateFilter('color', isSelected ? null : color.slug)
                }
                aria-pressed={isSelected}
                className={cn(
                  SHOP_SWATCH_BASE,
                  'h-8 w-8',
                  SHOP_CHIP_INTERACTIVE,
                  SHOP_FOCUS,
                  isSelected
                    ? SHOP_CHIP_SELECTED
                    : cn(SHOP_CHIP_HOVER, SHOP_CHIP_BORDER_HOVER)
                )}
                style={{ background: color.hex }}
                title={colorLabel}
                aria-label={colorLabel}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby={sizeGroupId}>
        <h3
          id={sizeGroupId}
          className="text-foreground text-sm font-semibold tracking-wide uppercase"
        >
          {t('size')}
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          {SIZES.map(size => {
            const isSelected = currentSize === size;

            return (
              <button
                key={size}
                type="button"
                onClick={() => updateFilter('size', isSelected ? null : size)}
                aria-pressed={isSelected}
                className={cn(
                  SHOP_SIZE_CHIP_BASE,
                  'px-3 py-1.5 text-sm',
                  SHOP_CHIP_INTERACTIVE,
                  SHOP_FOCUS,
                  isSelected
                    ? cn('bg-accent text-accent-foreground', SHOP_CHIP_SELECTED)
                    : cn(
                        'text-muted-foreground border-border hover:text-foreground bg-transparent',
                        SHOP_CHIP_HOVER,
                        SHOP_CHIP_BORDER_HOVER
                      )
                )}
              >
                {size}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
