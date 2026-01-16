'use client';

import { useId } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { CATEGORIES, COLORS, PRODUCT_TYPES, SIZES } from '@/lib/config/catalog';
import { cn } from '@/lib/utils';

export function ProductFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    router.push(
      queryString ? `/shop/products?${queryString}` : '/shop/products'
    );
  };

  return (
    <aside className="space-y-8" aria-label="Product filters">
      {/* Category */}
      <section aria-labelledby={categoryGroupId}>
        <h3
          id={categoryGroupId}
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          Category
        </h3>

        <ul className="mt-4 space-y-2" role="list">
          {CATEGORIES.map(cat => (
            <li key={cat.slug}>
              <button
                type="button"
                onClick={() => updateFilter('category', cat.slug)}
                aria-current={currentCategory === cat.slug ? 'true' : undefined}
                className={cn(
                  'text-sm transition-colors',
                  currentCategory === cat.slug
                    ? 'font-medium text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {cat.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Type */}
      <section aria-labelledby={typeGroupId}>
        <h3
          id={typeGroupId}
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          Type
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
                    'text-sm transition-colors',
                    isSelected
                      ? 'font-medium text-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {type.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Color */}
      <section aria-labelledby={colorGroupId}>
        <h3
          id={colorGroupId}
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          Color
        </h3>

        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-labelledby={colorGroupId}
        >
          {COLORS.map(color => {
            const isSelected = currentColor === color.slug;

            return (
              <button
                key={color.slug}
                type="button"
                onClick={() =>
                  updateFilter('color', isSelected ? null : color.slug)
                }
                aria-pressed={isSelected}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-all',
                  isSelected
                    ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background'
                    : 'border-border hover:border-muted-foreground'
                )}
                style={{ background: color.hex }}
                title={color.label}
                aria-label={color.label}
              />
            );
          })}
        </div>
      </section>

      {/* Size */}
      <section aria-labelledby={sizeGroupId}>
        <h3
          id={sizeGroupId}
          className="text-sm font-semibold uppercase tracking-wide text-foreground"
        >
          Size
        </h3>

        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-labelledby={sizeGroupId}
        >
          {SIZES.map(size => {
            const isSelected = currentSize === size;

            return (
              <button
                key={size}
                type="button"
                onClick={() => updateFilter('size', isSelected ? null : size)}
                aria-pressed={isSelected}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  isSelected
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
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
