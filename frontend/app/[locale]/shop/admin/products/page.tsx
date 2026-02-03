import { and, desc, eq, sql } from 'drizzle-orm';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminPagination } from '@/components/shop/admin/AdminPagination';
import { AdminProductDeleteButton } from '@/components/shop/admin/AdminProductDeleteButton';
import { AdminProductStatusToggle } from '@/components/shop/admin/AdminProductStatusToggle';
import { ShopAdminTopbar } from '@/components/shop/admin/ShopAdminTopbar';
import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  productPrices,
  products,
} from '@/db/schema';
import { Link } from '@/i18n/routing';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';
import { parsePage } from '@/lib/pagination';
import { issueCsrfToken } from '@/lib/security/csrf';
import { formatMoney, resolveCurrencyFromLocale } from '@/lib/shop/currency';

export const metadata: Metadata = {
  title: 'Admin Products | DevLovers',
  description: 'Create, edit, activate, and manage product catalog.',
};
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

function formatDate(value: Date | null, locale: string): string {
  if (!value) return '-';
  return value.toLocaleDateString(locale);
}

export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await guardShopAdminPage();

  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('shop.admin.products');

  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  const displayCurrency = resolveCurrencyFromLocale(locale);
  const isInUseSql = sql<boolean>`(
  exists (
    select 1
    from ${orderItems} oi
    where oi.product_id = ${products.id}
  )
  OR
  exists (
    select 1
    from ${inventoryMoves} im
    where im.product_id = ${products.id}
  )
)`;

  const all = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      category: products.category,
      type: products.type,
      stock: products.stock,
      badge: products.badge,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      createdAt: products.createdAt,
      priceMinor: productPrices.priceMinor,
      isInUse: isInUseSql,
    })
    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, displayCurrency)
      )
    )
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasNext = all.length > PAGE_SIZE;
  const rows = all.slice(0, PAGE_SIZE);

  const csrfTokenStatus = issueCsrfToken('admin:products:status');
  const csrfTokenDelete = issueCsrfToken('admin:products:delete');
  const TH_BASE =
    'px-3 py-2 text-left text-xs font-semibold text-foreground leading-tight whitespace-normal break-words';

  return (
    <>
      <ShopAdminTopbar />

      <main
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        aria-labelledby="admin-products-title"
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1
            id="admin-products-title"
            className="text-foreground text-2xl font-bold"
          >
            {t('title')}
          </h1>

          <Link
            href="/shop/admin/products/new"
            className="border-border text-foreground hover:bg-secondary inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors"
          >
            {t('newProduct')}
          </Link>
        </header>

        <section className="mt-6" aria-label={t('listCaption')}>
          {/* Mobile cards */}
          <div className="md:hidden">
            {rows.length === 0 ? (
              <div className="border-border text-muted-foreground rounded-md border p-4 text-sm">
                {t('empty')}
              </div>
            ) : (
              <ul className="space-y-3">
                {rows.map(row => {
                  const priceMinor = row.priceMinor;
                  const badge =
                    row.badge == null || row.badge === 'NONE' ? '-' : row.badge;

                  return (
                    <li
                      key={row.id}
                      className="border-border bg-background rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="text-foreground truncate text-sm font-semibold"
                            title={row.title}
                          >
                            {row.title}
                          </div>
                          <div
                            className="text-muted-foreground mt-0.5 truncate text-xs"
                            title={row.slug}
                          >
                            {row.slug}
                          </div>
                        </div>

                        <div className="text-foreground shrink-0 text-right text-sm whitespace-nowrap">
                          {priceMinor == null
                            ? '-'
                            : formatMoney(priceMinor, displayCurrency, locale)}
                        </div>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">
                            {t('table.category')}
                          </dt>
                          <dd
                            className="text-foreground truncate"
                            title={row.category ?? '-'}
                          >
                            {row.category ?? '-'}
                          </dd>
                        </div>

                        <div className="min-w-0">
                          <dt className="text-muted-foreground">
                            {t('table.type')}
                          </dt>
                          <dd
                            className="text-foreground truncate"
                            title={row.type ?? '-'}
                          >
                            {row.type ?? '-'}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">
                            {t('table.stock')}
                          </dt>
                          <dd className="text-foreground">{row.stock}</dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">
                            {t('table.badge')}
                          </dt>
                          <dd className="text-foreground">{badge}</dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">
                            {t('table.active')}
                          </dt>
                          <dd className="text-foreground">
                            {row.isActive ? t('actions.yes') : t('actions.no')}
                          </dd>
                        </div>

                        <div>
                          <dt className="text-muted-foreground">
                            {t('table.featured')}
                          </dt>
                          <dd className="text-foreground">
                            {row.isFeatured
                              ? t('actions.yes')
                              : t('actions.no')}
                          </dd>
                        </div>

                        <div className="col-span-2">
                          <dt className="text-muted-foreground">
                            {t('table.created')}
                          </dt>
                          <dd className="text-foreground">
                            {formatDate(row.createdAt, locale)}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/shop/products/${row.slug}`}
                          className="border-border text-foreground hover:bg-secondary inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                          aria-label={t('actions.viewProduct', {
                            title: row.title,
                          })}
                        >
                          {t('actions.view')}
                        </Link>

                        <Link
                          href={`/shop/admin/products/${row.id}/edit`}
                          className="border-border text-foreground hover:bg-secondary inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                          aria-label={t('actions.editProduct', {
                            title: row.title,
                          })}
                        >
                          {t('actions.edit')}
                        </Link>

                        <AdminProductStatusToggle
                          id={row.id}
                          initialIsActive={row.isActive}
                          csrfToken={csrfTokenStatus}
                        />

                        {row.isInUse ? null : (
                          <AdminProductDeleteButton
                            id={row.id}
                            title={row.title}
                            csrfToken={csrfTokenDelete}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="divide-border w-full table-fixed divide-y text-sm">
                <caption className="sr-only">{t('listCaption')}</caption>
                <colgroup>
                  <col className="w-[9.5rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-[6.5rem]" />
                  <col className="w-[6rem]" />
                  <col className="w-[5.5rem]" />
                  <col className="w-[5rem]" />
                  <col className="w-[4rem]" />
                  <col className="w-[5rem]" />
                  <col className="w-[5rem]" />
                  <col className="w-[4.5rem]" />
                  <col className="w-[11rem]" />
                </colgroup>
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className={TH_BASE}>
                      {t('table.title')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.slug')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.price')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.category')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.type')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.stock')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.badge')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.active')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.featured')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.created')}
                    </th>
                    <th scope="col" className={TH_BASE}>
                      {t('table.actions')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-border divide-y">
                  {rows.map(row => {
                    const priceMinor = row.priceMinor;

                    return (
                      <tr key={row.id} className="hover:bg-muted/50">
                        <td className="text-foreground max-w-0 px-3 py-2 font-medium">
                          <div className="truncate" title={row.title}>
                            {row.title}
                          </div>
                        </td>

                        <td className="text-muted-foreground max-w-0 px-3 py-2">
                          <div className="truncate" title={row.slug}>
                            {row.slug}
                          </div>
                        </td>

                        <td className="text-foreground px-3 py-2 whitespace-nowrap">
                          {priceMinor == null
                            ? '-'
                            : formatMoney(priceMinor, displayCurrency, locale)}
                        </td>

                        <td className="text-muted-foreground max-w-0 px-3 py-2">
                          <div className="truncate" title={row.category ?? '-'}>
                            {row.category ?? '-'}
                          </div>
                        </td>

                        <td className="text-muted-foreground max-w-0 px-3 py-2">
                          <div className="truncate" title={row.type ?? '-'}>
                            {row.type ?? '-'}
                          </div>
                        </td>

                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {row.stock}
                        </td>

                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {row.badge == null || row.badge === 'NONE'
                            ? '-'
                            : row.badge}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="bg-muted text-foreground inline-flex rounded-full px-2 py-1 text-xs font-medium">
                            {row.isActive ? t('actions.yes') : t('actions.no')}
                          </span>
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="bg-muted text-foreground inline-flex rounded-full px-2 py-1 text-xs font-medium">
                            {row.isFeatured
                              ? t('actions.yes')
                              : t('actions.no')}
                          </span>
                        </td>

                        <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                          {formatDate(row.createdAt, locale)}
                        </td>

                        <td className="px-3 py-2">
                          <div className="grid grid-cols-2 gap-2">
                            <Link
                              href={`/shop/products/${row.slug}`}
                              className="border-border text-foreground hover:bg-secondary break-words inline-flex items-center justify-center rounded-md border px-2 py-1 text-center text-xs leading-tight font-medium whitespace-normal transition-colors"
                              aria-label={t('actions.viewProduct', {
                                title: row.title,
                              })}
                            >
                              {t('actions.view')}
                            </Link>

                            <Link
                              href={`/shop/admin/products/${row.id}/edit`}
                              className="border-border text-foreground hover:bg-secondary break-words inline-flex items-center justify-center rounded-md border px-2 py-1 text-center text-xs leading-tight font-medium whitespace-normal transition-colors"
                              aria-label={t('actions.editProduct', {
                                title: row.title,
                              })}
                            >
                              {t('actions.edit')}
                            </Link>

                            <AdminProductStatusToggle
                              id={row.id}
                              initialIsActive={row.isActive}
                              csrfToken={csrfTokenStatus}
                            />

                            {row.isInUse ? null : (
                              <AdminProductDeleteButton
                                id={row.id}
                                title={row.title}
                                csrfToken={csrfTokenDelete}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {rows.length === 0 ? (
                    <tr>
                      <td
                        className="text-muted-foreground px-3 py-6"
                        colSpan={11}
                      >
                        {t('empty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4">
            <AdminPagination
              basePath="/shop/admin/products"
              page={page}
              hasNext={hasNext}
            />
          </div>
        </section>
      </main>
    </>
  );
}
