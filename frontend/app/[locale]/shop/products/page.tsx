import { Suspense } from 'react';
import { Filter } from 'lucide-react';

import { ProductFilters } from '@/components/shop/product-filters';
import { ProductSort } from '@/components/shop/product-sort';
import { CatalogProductsClient } from '@/components/shop/catalog-products-client';
import { getCatalogProducts } from '@/lib/shop/data';
import { catalogQuerySchema } from '@/lib/validation/shop';
import { CATALOG_PAGE_SIZE } from '@/lib/config/catalog';
import { redirect } from 'next/navigation';

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

  // Для “Load more” UX: починаємо завжди з 1-ї сторінки (URL ?page=... ігноруємо).
  const filters = {
    ...parsed,
    page: 1,
    limit: parsed.limit ?? CATALOG_PAGE_SIZE,
  };

  const catalog = await getCatalogProducts(filters, locale);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between border-b border-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          All Products
        </h1>
        <div className="flex items-center gap-4">
          <Suspense fallback={null}>
            <ProductSort />
          </Suspense>
          <button className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground lg:hidden">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div className="hidden lg:block">
          <Suspense fallback={null}>
            <ProductFilters />
          </Suspense>
        </div>

        <div>
          {catalog.products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
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
        </div>
      </div>
    </div>
  );
}
