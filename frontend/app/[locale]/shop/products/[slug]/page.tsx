import { ArrowLeft } from 'lucide-react';
import { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AddToCartButton } from '@/components/shop/AddToCartButton';
import { getPublicProductBySlug } from '@/db/queries/shop/products';
import { Link } from '@/i18n/routing';
import { formatMoney, resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { getProductPageData } from '@/lib/shop/data';
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

  const currency = resolveCurrencyFromLocale(locale);
  const publicProduct = await getPublicProductBySlug(slug, currency);
  if (!publicProduct) {
    notFound();
  }

  const result = await getProductPageData(slug, locale);

  if (result.kind === 'not_found') {
    notFound();
  }
  const isUnavailable = result.kind === 'unavailable';
  const resultProduct = (result as any).product ?? {};

  const product = {
    ...(publicProduct as any),
    ...Object.fromEntries(
      Object.entries(resultProduct).filter(([, v]) => v !== undefined)
    ),
  } as any;

  const NAV_LINK = cn(
    SHOP_NAV_LINK_BASE,
    SHOP_FOCUS,
    'text-lg',
    'items-center gap-2'
  );
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
            src={product.image || '/placeholder.svg'}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        </div>

        <div className="flex flex-col">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            {product.name}
          </h1>

          {isUnavailable ? (
            <div
              className="border-border bg-muted/30 text-muted-foreground mt-4 rounded-md border p-4 text-sm"
              role="status"
              aria-live="polite"
            >
              {t('notAvailable')}
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
                {formatMoney(product.price, product.currency, locale)}
              </span>

              {product.originalPrice && (
                <span className="text-muted-foreground text-lg line-through">
                  {formatMoney(product.originalPrice, product.currency, locale)}
                </span>
              )}
            </section>
          )}

          {product.description && (
            <p className="text-muted-foreground mt-6">{product.description}</p>
          )}

          {!isUnavailable && (
            <section aria-label="Purchase">
              <AddToCartButton product={product} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
