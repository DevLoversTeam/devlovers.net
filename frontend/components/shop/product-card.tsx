'use client';

import { Link } from '@/i18n/routing';
import Image from 'next/image';
import type { ShopProduct } from '@/lib/shop/data';
import { cn } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { formatMoney } from '@/lib/shop/currency';

const PLACEHOLDER = '/placeholder.svg';
const allowedHosts = new Set(['res.cloudinary.com', 'cdn.sanity.io']); // додай/прибери за потреби

function safeImageSrc(raw?: string | null) {
  if (!raw || raw.trim().length === 0) return PLACEHOLDER;

  const s = raw.trim();

  // public/*
  if (s.startsWith('/')) return s;

  // remote
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

  const src = safeImageSrc(product.image);

  return (
    <Link
      href={`/shop/products/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
    >
      {product.badge && product.badge !== 'NONE' && (
        <span
          className={cn(
            'absolute left-3 top-3 z-10 rounded px-2 py-1 text-xs font-semibold uppercase',
            product.badge === 'SALE' && 'bg-accent text-accent-foreground',
            product.badge === 'NEW' && 'bg-foreground text-background'
          )}
        >
          {product.badge}
        </span>
      )}

      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={src}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium text-foreground">{product.name}</h3>

        <div className="mt-2 flex items-center gap-2" aria-label="Price">
          <span
            className={cn(
              'text-sm font-semibold',
              product.badge === 'SALE' ? 'text-accent' : 'text-foreground'
            )}
          >
            {formatMoney(product.price, product.currency, locale)}
          </span>

          {product.originalPrice && (
            <span className="text-sm text-muted-foreground line-through">
              {formatMoney(product.originalPrice, product.currency, locale)}
            </span>
          )}
        </div>

        {!product.inStock && (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            Sold out
          </p>
        )}
      </div>
    </Link>
  );
}
