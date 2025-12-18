'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { ShopProduct } from '@/lib/shop/data';
import { formatPrice } from '@/lib/shop/currency';
import { cn } from '@/lib/utils';

interface ProductCardProps {
  product: ShopProduct;
}

export function ProductCard({ product }: ProductCardProps) {
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
          src={product.image || '/placeholder.svg'}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium text-foreground">{product.name}</h3>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-semibold',
              product.badge === 'SALE' ? 'text-accent' : 'text-foreground'
            )}
          >
            {formatPrice(product.price)}
          </span>
          {product.originalPrice && (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(product.originalPrice)}
            </span>
          )}
        </div>
        {!product.inStock && (
          <p className="mt-2 text-xs text-muted-foreground">Sold out</p>
        )}
      </div>
    </Link>
  );
}
