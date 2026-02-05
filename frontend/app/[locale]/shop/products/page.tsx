import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { CatalogProductsClient } from '@/components/shop/CatalogProductsClient';
import { ProductFilters } from '@/components/shop/ProductFilters';
import { ProductsToolbar } from '@/components/shop/ProductsToolbar';
import { CATALOG_PAGE_SIZE } from '@/lib/config/catalog';
import { getCatalogProducts } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';

export const metadata: Metadata = {
  title: 'Products | DevLovers',
  description: 'Browse all DevLovers products, available sizes, and prices',
};

type RawSearchParams = {
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  sort?: string;
  page?: string;
  filter?: string;
};

interface ProductsPageProps {
  searchParams: Promise<RawSearchParams>;
}

export default async function ProductsPage({
  searchParams,
  params,
}: ProductsPageProps & { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const t = await getTranslations('shop.products');

  const hasLegacyFilter = resolvedSearchParams.filter === 'new';
  const needsCanonical = hasLegacyFilter;

  if (needsCanonical) {
    const qsParams = new URLSearchParams();

    for (const [k, v] of Object.entries(resolvedSearchParams)) {
      if (!v) continue;
      if (k === 'filter') continue;
      qsParams.set(k, v);
    }

    if (hasLegacyFilter && !resolvedSearchParams.sort) {
      qsParams.set('sort', 'newest');
    }

    const qs = qsParams.toString();
    const basePath = `/shop/products`;

    redirect(qs ? `${basePath}?${qs}` : basePath);
  }

  const parsedParams = catalogQuerySchema.safeParse(resolvedSearchParams);

  const parsed = parsedParams.success
    ? parsedParams.data
    : { page: 1, limit: CATALOG_PAGE_SIZE };

  const page =
    typeof parsed.page === 'number' &&
    Number.isFinite(parsed.page) &&
    parsed.page >= 1
      ? parsed.page
      : 1;

  const filters = {
    ...parsed,
    page,
    limit: parsed.limit ?? CATALOG_PAGE_SIZE,
  };

  const catalog = await getCatalogProducts(filters, locale);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="border-border flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          {t('title')}
        </h1>

        <Suspense fallback={null}>
          <ProductsToolbar />
        </Suspense>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div className="hidden lg:block">
          <Suspense fallback={null}>
            <ProductFilters />
          </Suspense>
        </div>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="sr-only">
            Product results
          </h2>

          {catalog.products.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              role="status"
            >
              <p className="text-foreground text-lg font-medium">
                {t('noProductsFound')}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                {t('adjustFilters')}
              </p>
            </div>
          ) : (
            <CatalogProductsClient locale={locale} initialCatalog={catalog} />
          )}
        </section>
      </div>
    </main>
  );
}
