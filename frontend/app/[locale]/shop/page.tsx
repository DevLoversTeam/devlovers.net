import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CategoryTile } from '@/components/shop/CategoryTile';
import { ProductCard } from '@/components/shop/ProductCard';
import { Hero } from '@/components/shop/ShopHero';
import { Link } from '@/i18n/routing';
import { getHomepageContent } from '@/lib/shop/data';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  SHOP_FOCUS,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';

export const metadata: Metadata = {
  title: 'Shop | DevLovers',
  description:
    'DevLovers merch shop — browse products, add to cart, and checkout.',
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const content = await getHomepageContent(locale);
  const t = await getTranslations('shop.page');

  return (
    <>
      <Hero
        headline={t('comingSoon.headline')}
        subheadline={t('comingSoon.subheadline')}
        ctaText={t('comingSoon.cta')}
        ctaLink="/shop/products"
      />

      <section
        className="border-border bg-background border-t py-16"
        aria-labelledby="new-arrivals-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="new-arrivals-heading"
              className="text-foreground text-2xl font-bold tracking-tight"
            >
              {t('newArrivals')}
            </h2>

            <Link
              href="/shop/products?filter=new"
              className="group border-border text-muted-foreground hover:text-foreground focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-md border bg-transparent px-4 py-2 text-xs font-semibold tracking-[0.25em] uppercase shadow-none transition-[transform,box-shadow,color,filter] duration-500 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shop-card-shadow-hover)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[color:var(--color-ring)] focus-visible:ring-offset-2 focus-visible:outline-none sm:text-sm"
              aria-label={t('viewAll')}
            >
              <span>{t('viewAll')}</span>
              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          </header>

          <ul className="mt-8 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {content.newArrivals.map(product => (
              <li key={product.id} className="min-w-0">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="border-border bg-background border-t py-16"
        aria-labelledby="shop-by-category-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between">
            <h2
              id="shop-by-category-heading"
              className="text-foreground text-2xl font-bold tracking-tight"
            >
              {t('shopByCategory')}
            </h2>
          </header>

          <ul className="mt-8 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {content.categories.map(category => (
              <li key={category.id} className="min-w-0">
                <CategoryTile category={category} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="bg-foreground text-background py-16"
        aria-labelledby="shop-cta-heading"
      >
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2
            id="shop-cta-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t('hero.headline')}
          </h2>

          <p className="text-background/80 mx-auto mt-4 max-w-xl">
            {t('hero.subheadline')}
          </p>

          <div className="mt-8">
            <Link
              href="/shop/products"
              className={` ${SHOP_CTA_BASE} ${SHOP_FOCUS} px-8 py-3 text-[color:var(--shop-cta-fg)] shadow-[var(--shop-cta-shadow)] hover:shadow-[var(--shop-cta-shadow-hover)] sm:px-10 md:px-12 md:py-3.5`}
              aria-label={t('hero.cta')}
            >
              <span
                className="absolute inset-0"
                style={shopCtaGradient('--shop-cta-bg', '--shop-cta-bg-hover')}
                aria-hidden="true"
              />

              <span
                className={SHOP_CTA_WAVE}
                style={shopCtaGradient('--shop-cta-bg-hover', '--shop-cta-bg')}
                aria-hidden="true"
              />

              <span className={SHOP_CTA_INSET} aria-hidden="true" />

              <span className="relative z-10 flex items-center gap-2">
                <span>{t('hero.cta')}</span>
                <span
                  aria-hidden="true"
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
