// frontend/app/[locale]/shop/products/page.tsx

import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { ProductFilters } from '@/components/shop/product-filters';
import { CatalogProductsClient } from '@/components/shop/catalog-products-client';
import { ProductsToolbar } from '@/components/shop/products-toolbar';
import { getCatalogProducts } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';
import { CATALOG_PAGE_SIZE } from '@/lib/config/catalog';

type RawSearchParams = {
  category?: string;
  type?: string;
  color?: string;
  size?: string;
  sort?: string;
  page?: string;
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

  // canonicalize: infinite-load page should not be shareable as ?page=N
  if (resolvedSearchParams.page) {
    const qsParams = new URLSearchParams();

    for (const [k, v] of Object.entries(resolvedSearchParams)) {
      if (!v) continue;
      if (k === 'page') continue;
      qsParams.set(k, v);
    }

    const qs = qsParams.toString();
    const basePath = `/${locale}/shop/products`;

    redirect(qs ? `${basePath}?${qs}` : basePath);
  }

  const parsedParams = catalogQuerySchema.safeParse(resolvedSearchParams);

  const parsed = parsedParams.success
    ? parsedParams.data
    : { page: 1, limit: CATALOG_PAGE_SIZE };

  const filters = {
    ...parsed,
    page: 1,
    limit: parsed.limit ?? CATALOG_PAGE_SIZE,
  };

  const catalog = await getCatalogProducts(filters, locale);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          All Products
        </h1>

        <Suspense fallback={null}>
          <ProductsToolbar />
        </Suspense>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="sr-only">
            Filters
          </h2>
          <Suspense fallback={null}>
            <ProductFilters />
          </Suspense>
        </aside>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="sr-only">
            Product results
          </h2>

          {catalog.products.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              role="status"
              aria-live="polite"
            >
              <p className="text-lg font-medium text-foreground">
                No products found
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try adjusting your filters to find what you&apos;re looking for.
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
