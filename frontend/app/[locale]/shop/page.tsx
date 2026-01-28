import { Link } from '@/i18n/routing';
import { ProductCard } from '@/components/shop/product-card';
import { Hero } from '@/components/shop/shop-hero';
import { CategoryTile } from '@/components/shop/category-tile';
import { getHomepageContent } from '@/lib/shop/data';
import { getTranslations } from 'next-intl/server';

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
        className="border-t border-border bg-background py-16"
        aria-labelledby="new-arrivals-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="new-arrivals-heading"
              className="text-2xl font-bold tracking-tight text-foreground"
            >
              {t('newArrivals')}
            </h2>

            <Link
              href="/shop/products?filter=new"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              aria-label={t('viewAll')}
            >
              {t('viewAll')} <span aria-hidden="true">→</span>
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
        className="border-t border-border bg-background py-16"
        aria-labelledby="shop-by-category-heading"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between">
            <h2
              id="shop-by-category-heading"
              className="text-2xl font-bold tracking-tight text-foreground"
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
        className="bg-foreground py-16 text-background"
        aria-labelledby="shop-cta-heading"
      >
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2
            id="shop-cta-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t('hero.headline')}
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-background/80">
            {t('hero.subheadline')}
          </p>

          <div className="mt-8">
            <Link
              href="/shop/products"
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--shop-cta-bg)] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--shop-cta-fg)] transition-opacity hover:opacity-90"
              aria-label={t('hero.cta')}
            >
              {t('hero.cta')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
