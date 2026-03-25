'use client';

import Image from 'next/image';
import { useState } from 'react';

import { SHOP_FOCUS } from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
import type { ShopProductImage } from '@/lib/validation/shop';

const PLACEHOLDER_IMAGE = '/placeholder.svg';
const allowedHosts = new Set(['res.cloudinary.com', 'cdn.sanity.io']);

function safeImageSrc(raw?: string | null) {
  if (!raw || raw.trim().length === 0) return PLACEHOLDER_IMAGE;

  const src = raw.trim();

  if (src.startsWith('/')) return src;

  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const url = new URL(src);
      return allowedHosts.has(url.hostname) ? src : PLACEHOLDER_IMAGE;
    } catch {
      return PLACEHOLDER_IMAGE;
    }
  }

  return PLACEHOLDER_IMAGE;
}

type ProductGalleryProps = {
  productName: string;
  images: ShopProductImage[];
  badgeLabel?: string | null;
};

const fallbackImage: ShopProductImage = {
  id: 'fallback:primary',
  url: PLACEHOLDER_IMAGE,
  publicId: undefined,
  sortOrder: 0,
  isPrimary: true,
};

export function ProductGallery({
  productName,
  images,
  badgeLabel,
}: ProductGalleryProps) {
  const galleryImages = images.length > 0 ? images : [fallbackImage];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedImage = galleryImages[selectedIndex] ?? galleryImages[0];

  return (
    <div className="space-y-4" aria-label="Product gallery">
      <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
        {badgeLabel ? (
          <span
            className={cn(
              'absolute top-4 left-4 z-10 rounded px-2 py-1 text-xs font-semibold uppercase',
              'bg-foreground text-background dark:bg-accent dark:text-accent-foreground'
            )}
          >
            {badgeLabel}
          </span>
        ) : null}

        <Image
          src={safeImageSrc(selectedImage?.url)}
          alt={`${productName} photo ${selectedIndex + 1}`}
          fill
          className="object-cover"
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
        />
      </div>

      {galleryImages.length > 1 ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {galleryImages.map((image, index) => {
            const isSelected = index === selectedIndex;

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedIndex(index)}
                aria-label={`Show ${productName} photo ${index + 1}`}
                aria-pressed={isSelected}
                className={cn(
                  SHOP_FOCUS,
                  'bg-muted relative aspect-square overflow-hidden rounded-lg border transition',
                  isSelected
                    ? 'border-foreground ring-foreground/15 shadow-sm ring-2'
                    : 'border-border hover:border-accent/60'
                )}
              >
                <Image
                  src={safeImageSrc(image.url)}
                  alt=""
                  fill
                  className={cn(
                    'object-cover transition-opacity',
                    isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                  )}
                  sizes="(max-width: 1024px) 30vw, 12vw"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
