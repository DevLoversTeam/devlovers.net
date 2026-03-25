import { ArrowLeft } from 'lucide-react';
import { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddToCartButton } from '@/components/shop/AddToCartButton';
import { Link } from '@/i18n/routing';
import { getStorefrontAvailabilityState } from '@/lib/shop/availability';
import { formatMoney } from '@/lib/shop/currency';
import { getProductGalleryImages, getProductPageData } from '@/lib/shop/data';
import { getApparelSizeGuideForProduct } from '@/lib/shop/size-guide';
import { SHOP_FOCUS, SHOP_NAV_LINK_BASE } from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Product name | DevLovers',
  description: 'Details, price, and availability for product.',
};
export const dynamic = 'force-dynamic';

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

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const t = await getTranslations('shop.products');
  const tProduct = await getTranslations('shop.product');

  const result = await getProductPageData(slug, locale);

  if (result.kind === 'not_found') {
    notFound();
  }

  const product = result.product;
  const commerceProduct =
    result.kind === 'available' ? result.commerceProduct : null;
  const availabilityState = getStorefrontAvailabilityState(commerceProduct);
  const sizeGuide = getApparelSizeGuideForProduct(commerceProduct, locale);
  const galleryImages = getProductGalleryImages(product);
  const primaryImage = galleryImages[0];
  const secondaryImages = galleryImages.slice(1);

  const NAV_LINK = cn(
    SHOP_NAV_LINK_BASE,
    SHOP_FOCUS,
    'text-lg',
    'items-center gap-2'
  );
  const messages = await getMessages();
  const productDescriptions = (messages as any).shop?.productDescriptions ?? {};
  const badge = product?.badge as string | undefined;
  const badgeLabel =
    badge && badge !== 'NONE'
      ? (() => {
          try {
            return tProduct(`badges.${badge}`);
          } catch {
            return badge;
          }
        })()
      : null;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Product navigation">
        <Link href="/shop/products" className={NAV_LINK}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('backToProducts')}
        </Link>
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-4" aria-label="Product gallery">
          <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
            {badge && badge !== 'NONE' && (
              <span
                className={cn(
                  'absolute top-4 left-4 z-10 rounded px-2 py-1 text-xs font-semibold uppercase',
                  'bg-foreground text-background dark:bg-accent dark:text-accent-foreground'
                )}
              >
                {badgeLabel}
              </span>
            )}

            <Image
              src={safeImageSrc(primaryImage?.url)}
              alt={`${product.name} photo 1`}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          </div>

          {secondaryImages.length > 0 ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {secondaryImages.map((image, index) => (
                <div
                  key={image.id}
                  className="bg-muted relative aspect-square overflow-hidden rounded-lg"
                >
                  <Image
                    src={safeImageSrc(image.url)}
                    alt={`${product.name} photo ${index + 2}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 30vw, 12vw"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            {product.name}
          </h1>

          <div
            className={cn(
              'border-border bg-muted/30 mt-4 rounded-xl border px-4 py-3 text-sm leading-6',
              availabilityState === 'available_to_order'
                ? 'text-foreground'
                : 'text-muted-foreground'
            )}
            role="status"
            aria-live="polite"
          >
            {availabilityState === 'available_to_order'
              ? tProduct('availability.availableToOrder')
              : availabilityState === 'out_of_stock'
                ? tProduct('availability.currentlyUnavailable')
                : tProduct('availability.unavailableLocaleCurrency')}
          </div>

          {commerceProduct === null ? (
            <div className="text-muted-foreground mt-3 text-sm">
              {tProduct('availability.browseOtherProducts')}
            </div>
          ) : (
            <section
              className="mt-4 flex items-center gap-3"
              aria-label="Price"
            >
              <span
                className={`text-2xl font-bold ${
                  badge === 'SALE' ? 'text-accent' : 'text-foreground'
                }`}
              >
                {formatMoney(
                  commerceProduct.price,
                  commerceProduct.currency,
                  locale
                )}
              </span>

              {commerceProduct.originalPrice && (
                <span className="text-muted-foreground text-lg line-through">
                  {formatMoney(
                    commerceProduct.originalPrice,
                    commerceProduct.currency,
                    locale
                  )}
                </span>
              )}
            </section>
          )}

          {(() => {
            const desc =
              (productDescriptions[slug] as string) || product.description;
            if (!desc) return null;
            return (
              <div className="text-muted-foreground mt-6 space-y-2">
                {desc.split('\n').map((line: string, i: number) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            );
          })()}

          {commerceProduct ? (
            <section aria-label="Purchase">
              <AddToCartButton product={commerceProduct} sizeGuide={sizeGuide} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
