'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import type { ShopProduct } from '@/lib/shop/data';
import {
  SHOP_CHIP_HOVER,
  SHOP_CHIP_INTERACTIVE,
  SHOP_CHIP_SELECTED,
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  SHOP_FOCUS,
  SHOP_SIZE_CHIP_BASE,
  SHOP_STEPPER_BUTTON_BASE,
  SHOP_SWATCH_BASE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

import { useCart } from './CartProvider';

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

  const colorGroupId = useId();
  const sizeGroupId = useId();
  const quantityGroupId = useId();
  const ctaBaseVar = added
    ? '--shop-hero-btn-success-bg'
    : '--shop-hero-btn-bg';
  const ctaHoverVar = added
    ? '--shop-hero-btn-success-bg-hover'
    : '--shop-hero-btn-bg-hover';

  return (
    <section className="mt-8 space-y-6" aria-label={t('purchaseOptions')}>
      {product.colors && product.colors.length > 0 ? (
        <fieldset className="min-w-0">
          <legend
            id={colorGroupId}
            className="text-foreground text-sm font-semibold tracking-wide uppercase"
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
                    SHOP_SWATCH_BASE,
                    SHOP_CHIP_INTERACTIVE,
                    SHOP_FOCUS,
                    selectedColor === color
                      ? cn(
                          SHOP_CHIP_SELECTED,
                          'hover:border-accent hover:shadow-[var(--shop-chip-shadow-selected)]'
                        )
                      : 'hover:border-accent/60 hover:shadow-[var(--shop-chip-shadow-hover)]'
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

      {product.sizes && product.sizes.length > 0 ? (
        <fieldset className="min-w-0">
          <legend
            id={sizeGroupId}
            className="text-foreground text-sm font-semibold tracking-wide uppercase"
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
                  SHOP_SIZE_CHIP_BASE,
                  SHOP_CHIP_INTERACTIVE,
                  SHOP_FOCUS,
                  selectedSize === size
                    ? cn('bg-accent text-accent-foreground', SHOP_CHIP_SELECTED)
                    : 'text-muted-foreground border-border hover:text-foreground hover:border-accent/60 bg-transparent hover:shadow-[var(--shop-chip-shadow-hover)]'
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <section aria-labelledby={quantityGroupId}>
        <h3
          id={quantityGroupId}
          className="text-foreground text-sm font-semibold tracking-wide uppercase"
        >
          {t('quantity')}
        </h3>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className={cn(
              SHOP_STEPPER_BUTTON_BASE,
              SHOP_CHIP_INTERACTIVE,
              SHOP_CHIP_HOVER,
              SHOP_FOCUS
            )}
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
            className={cn(
              SHOP_STEPPER_BUTTON_BASE,
              SHOP_CHIP_INTERACTIVE,
              SHOP_CHIP_HOVER,
              SHOP_FOCUS
            )}
            aria-label={t('increaseQuantity')}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <button
        type="button"
        onClick={handleAddToCart}
        disabled={!product.inStock}
        className={cn(
          SHOP_CTA_BASE,
          SHOP_FOCUS,
          'w-full justify-center gap-2 px-8 py-3',
          'transition-[transform,filter] duration-700 ease-out',
          !product.inStock &&
            'bg-muted text-muted-foreground cursor-not-allowed',
          product.inStock &&
            (added
              ? 'text-white shadow-[var(--shop-hero-btn-success-shadow)] hover:shadow-[var(--shop-hero-btn-success-shadow-hover)]'
              : 'text-white shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]')
        )}
      >
        {product.inStock ? (
          <>
            {/* base gradient */}
            <span
              className="absolute inset-0"
              style={shopCtaGradient(ctaBaseVar, ctaHoverVar)}
              aria-hidden="true"
            />

            {/* hover wave overlay */}
            <span
              className={SHOP_CTA_WAVE}
              style={shopCtaGradient(ctaHoverVar, ctaBaseVar)}
              aria-hidden="true"
            />

            {/* glass inset */}
            <span className={SHOP_CTA_INSET} aria-hidden="true" />
          </>
        ) : null}

        <span className="relative z-10 flex items-center gap-2">
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
        </span>
      </button>
    </section>
  );
}
