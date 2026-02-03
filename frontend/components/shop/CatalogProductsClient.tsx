'use client';

import { type ReadonlyURLSearchParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import React from 'react';

import { CatalogLoadMore } from '@/components/shop/CatalogLoadMore';
import { ProductCard } from '@/components/shop/ProductCard';
import { logError } from '@/lib/logging';

type Product = React.ComponentProps<typeof ProductCard>['product'] & {
  id: string;
};

type CatalogPayload = {
  products: Product[];
  hasMore: boolean;
  page: number;
};

function stripPageParam(sp: ReadonlyURLSearchParams | null): string {
  const p = new URLSearchParams(sp?.toString() ?? '');
  p.delete('page');
  return p.toString();
}

export function CatalogProductsClient({
  locale,
  initialCatalog,
}: {
  locale: string;
  initialCatalog: CatalogPayload;
}) {
  const searchParams = useSearchParams();
  const t = useTranslations('shop.catalog');

  const baseQuery = React.useMemo(
    () => stripPageParam(searchParams),
    [searchParams]
  );

  const [products, setProducts] = React.useState<Product[]>(
    initialCatalog.products
  );
  const [page, setPage] = React.useState<number>(initialCatalog.page);
  const [hasMore, setHasMore] = React.useState<boolean>(initialCatalog.hasMore);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activeQueryRef = React.useRef<string>(`${baseQuery}|l=${locale}`);

  React.useEffect(() => {
    activeQueryRef.current = `${baseQuery}|l=${locale}`;
    setProducts(initialCatalog.products);
    setPage(initialCatalog.page);
    setHasMore(initialCatalog.hasMore);
    setIsLoadingMore(false);
    setError(null);
  }, [
    baseQuery,
    locale,
    initialCatalog.products,
    initialCatalog.page,
    initialCatalog.hasMore,
  ]);

  const onLoadMore = async () => {
    if (!hasMore || isLoadingMore) return;

    setIsLoadingMore(true);
    setError(null);

    const nextPage = page + 1;

    const query = new URLSearchParams(baseQuery);
    query.set('page', String(nextPage));

    const requestQueryKey = `${baseQuery}|l=${locale}`;
    query.set('locale', locale);

    try {
      const res = await fetch(`/api/shop/catalog?${query.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!res.ok) {
        setError(t('loadMoreFailedHttp', { status: res.status }));
        return;
      }

      const data = (await res.json()) as CatalogPayload;

      if (activeQueryRef.current !== requestQueryKey) return;

      setProducts(prev => {
        const seen = new Set(prev.map(p => p.id));
        const appended = data.products.filter(p => !seen.has(p.id));
        return [...prev, ...appended];
      });

      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (err) {
      logError('[shop.catalog] load more failed', err, {
        locale,
        baseQuery,
        nextPage,
      });
      setError(t('loadMoreFailed'));
    } finally {
      if (activeQueryRef.current === requestQueryKey) {
        setIsLoadingMore(false);
      }
    }
  };

  return (
    <section aria-label={t('results')}>
      <ul
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={t('products')}
      >
        {products.map(p => (
          <li key={p.id} className="min-w-0">
            <ProductCard product={p} />
          </li>
        ))}
      </ul>

      <nav
        className="mt-12 flex flex-col items-center gap-3"
        aria-label={t('pagination')}
      >
        <CatalogLoadMore
          hasMore={hasMore}
          isLoading={isLoadingMore}
          onLoadMore={onLoadMore}
        />

        {error ? (
          <p className="text-muted-foreground text-sm" role="status">
            {error}
          </p>
        ) : null}
      </nav>
    </section>
  );
}
