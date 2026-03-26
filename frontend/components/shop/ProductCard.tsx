'use client';

import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';
import { getStorefrontAvailabilityState } from '@/lib/shop/availability';
import { formatMoney } from '@/lib/shop/currency';
import { SHOP_FOCUS } from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
import type { ShopProduct } from '@/lib/validation/shop';

const PLACEHOLDER = '/placeholder.svg';
const allowedHosts = new Set(['res.cloudinary.com', 'cdn.sanity.io']);

function safeImageSrc(raw?: string | null) {
  if (!raw || raw.trim().length === 0) return PLACEHOLDER;

  const s = raw.trim();

  if (s.startsWith('/')) return s;

  if (s.startsWith('http://') || s.startsWith('https://')) {
    try {
      const u = new URL(s);
      return allowedHosts.has(u.hostname) ? s : PLACEHOLDER;
    } catch {
      return PLACEHOLDER;
    }
  }

  return PLACEHOLDER;
}

interface ProductCardProps {
  product: ShopProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale ?? 'en';
  const t = useTranslations('shop.product');
  const availabilityState = getStorefrontAvailabilityState(product);

  const src = safeImageSrc(product.image);

  return (
    <Link
      href={`/shop/products/${product.slug}`}
      className={cn(
        'group border-border bg-card relative flex h-full flex-col overflow-hidden rounded-lg border transition-shadow duration-500 hover:border-transparent hover:shadow-[var(--shop-card-shadow-hover)]',
        SHOP_FOCUS
      )}
    >
      {product.badge && product.badge !== 'NONE' && (
        <span
          className={cn(
            'absolute top-3 left-3 z-10 rounded px-2 py-1 text-xs font-semibold uppercase',
            'bg-foreground text-background dark:bg-accent dark:text-accent-foreground'
          )}
        >
          {t(`badges.${product.badge}`)}
        </span>
      )}

      <div className="bg-muted relative aspect-square overflow-hidden">
        <Image
          src={src}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-muted-foreground line-clamp-2 min-h-10 text-sm leading-5 font-medium">
          {product.name}
        </h3>

        <div className="mt-auto pt-3">
          <div className="flex min-h-6 items-center gap-2" aria-label="Price">
            <span
              className={cn(
                'text-sm font-semibold',
                product.badge === 'SALE' ? 'text-accent' : 'text-foreground'
              )}
            >
              {formatMoney(product.price, product.currency, locale)}
            </span>

            {product.originalPrice && (
              <span className="text-muted-foreground text-sm line-through">
                {formatMoney(product.originalPrice, product.currency, locale)}
              </span>
            )}
          </div>

          <p
            className="text-muted-foreground mt-2 min-h-4 text-xs leading-4"
            {...(availabilityState === 'available_to_order'
              ? { 'aria-label': t('availability.availableToOrder') }
              : {})}
          >
            {availabilityState === 'available_to_order'
              ? t('availability.availableToOrder')
              : t('availability.currentlyUnavailable')}
          </p>
        </div>
      </div>
    </Link>
  );
}
