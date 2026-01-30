'use client';

import { useId, useState } from 'react';
import type { ShopProduct } from '@/lib/shop/data';
import { cn } from '@/lib/utils';
import { Check, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCart } from './cart-provider';

interface AddToCartButtonProps {
  product: ShopProduct;
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addToCart } = useCart();
  const t = useTranslations('shop.product');
  const tColors = useTranslations('shop.catalog.colors');
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    product.sizes?.[0]
  );
  const [selectedColor, setSelectedColor] = useState<string | undefined>(
    product.colors?.[0]
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const translateColor = (color: string): string => {
    const colorSlug = color.toLowerCase();
    try {
      return tColors(colorSlug);
    } catch {
      return color;
    }
  };

  const handleAddToCart = () => {
    if (!product.inStock) return;

    addToCart(product, quantity, selectedSize, selectedColor);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const colorMap: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    grey: '#6b7280',
    navy: '#1e3a5f',
    multicolor:
      'linear-gradient(135deg, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #8b00ff)',
  };

  // ids for proper grouping semantics (no behavior changes)
  const colorGroupId = useId();
  const sizeGroupId = useId();
  const quantityGroupId = useId();

  return (
    <section className="mt-8 space-y-6" aria-label={t('purchaseOptions')}>
      {/* Colors */}
      {product.colors && product.colors.length > 0 ? (
        <fieldset className="min-w-0">
          <legend
            id={colorGroupId}
            className="text-sm font-medium text-foreground"
          >
            {t('color')}
          </legend>

          <div
            className="mt-3 flex gap-2"
            role="radiogroup"
            aria-labelledby={colorGroupId}
          >
            {product.colors.map(color => {
              const translatedColor = translateColor(color);
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  role="radio"
                  aria-checked={selectedColor === color}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 transition-all',
                    selectedColor === color
                      ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-background'
                      : 'border-border hover:border-muted-foreground'
                  )}
                  style={{
                    background: colorMap[color] || color,
                  }}
                  title={translatedColor}
                  aria-label={translatedColor}
                />
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* Sizes */}
      {product.sizes && product.sizes.length > 0 ? (
        <fieldset className="min-w-0">
          <legend
            id={sizeGroupId}
            className="text-sm font-medium text-foreground"
          >
            {t('size')}
          </legend>

          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-labelledby={sizeGroupId}
          >
            {product.sizes.map(size => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                role="radio"
                aria-checked={selectedSize === size}
                className={cn(
                  'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                  selectedSize === size
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-foreground hover:border-foreground'
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* Quantity */}
      <section aria-labelledby={quantityGroupId}>
        <h3
          id={quantityGroupId}
          className="text-sm font-medium text-foreground"
        >
          {t('quantity')}
        </h3>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary"
            aria-label={t('decreaseQuantity')}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <output className="w-12 text-center text-lg font-medium">
            {quantity}
          </output>

          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary"
            aria-label={t('increaseQuantity')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Add to Cart Button */}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!product.inStock}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-semibold uppercase tracking-wide transition-colors',
          product.inStock
            ? added
              ? 'bg-green-600 text-white'
              : 'bg-accent text-accent-foreground hover:bg-accent/90'
            : 'cursor-not-allowed bg-muted text-muted-foreground'
        )}
      >
        {!product.inStock ? (
          t('soldOut')
        ) : added ? (
          <>
            <Check className="h-5 w-5" aria-hidden="true" />
            {t('addedToCart')}
          </>
        ) : (
          t('addToCart')
        )}
      </button>
    </section>
  );
}
