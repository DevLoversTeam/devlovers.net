import { ArrowLeft } from 'lucide-react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages, getTranslations } from 'next-intl/server';

import { AddToCartButton } from '@/components/shop/AddToCartButton';
import { ProductGallery } from '@/components/shop/ProductGallery';
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
        <ProductGallery
          productName={product.name}
          images={galleryImages}
          badgeLabel={badgeLabel}
        />

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
              <AddToCartButton
                product={commerceProduct}
                sizeGuide={sizeGuide}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
