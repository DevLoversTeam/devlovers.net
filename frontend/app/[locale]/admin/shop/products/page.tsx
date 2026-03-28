import { and, desc, eq, sql } from 'drizzle-orm';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminPagination } from '@/components/admin/shop/AdminPagination';
import { AdminProductDeleteButton } from '@/components/admin/shop/AdminProductDeleteButton';
import { AdminProductStatusToggle } from '@/components/admin/shop/AdminProductStatusToggle';
import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  productPrices,
  products,
} from '@/db/schema';
import { Link } from '@/i18n/routing';
import { parsePage } from '@/lib/pagination';
import { issueCsrfToken } from '@/lib/security/csrf';
import { formatMoney, resolveCurrencyFromLocale } from '@/lib/shop/currency';

export const metadata: Metadata = {
  title: 'Admin Products | DevLovers',
  description: 'Create, edit, activate, and manage product catalog.',
};

const PAGE_SIZE = 25;
const TH_BASE =
  'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
const TD_BASE = 'px-3 py-3 text-sm align-top';
const ACTION_LINK_CLASS =
  'inline-flex h-8 w-full items-center justify-center rounded-md border border-border px-2.5 text-[11px] font-medium text-foreground leading-none whitespace-nowrap transition-colors hover:bg-secondary';
const PRIMARY_BUTTON_CLASS =
  'bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors';

function formatDate(value: Date | null, locale: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function formatBadge(value: string | null): string | null {
  if (!value || value === 'NONE') return null;
  return value;
}

function booleanBadgeClass(value: boolean, tone: 'success' | 'accent'): string {
  if (!value) return 'bg-muted text-muted-foreground';
  if (tone === 'success') return 'bg-emerald-500/10 text-emerald-500';
  return 'bg-sky-500/10 text-sky-500';
}

function productBadgeClass(badge: string | null): string {
  if (badge === 'SALE') return 'bg-amber-500/10 text-amber-500';
  if (badge === 'NEW') return 'bg-sky-500/10 text-sky-500';
  return 'bg-muted text-muted-foreground';
}

function formatCatalogMeta(
  category: string | null,
  type: string | null
): string | null {
  const parts = [category, type].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );

  return parts.length ? parts.join(' / ') : null;
}

export default async function AdminProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
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

  return (
    <main
      className="mx-auto max-w-6xl px-6 py-8"
      aria-labelledby="admin-products-title"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            id="admin-products-title"
            className="text-foreground text-2xl font-bold"
          >
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>

        <Link href="/admin/shop/products/new" className={PRIMARY_BUTTON_CLASS}>
          {t('newProduct')}
        </Link>
      </header>

      <section className="mt-6" aria-label={t('listCaption')}>
        {/* Mobile cards */}
        <div className="md:hidden">
          {rows.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              {t('empty')}
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map(row => {
                const priceMinor = row.priceMinor;
                const badge = formatBadge(row.badge);
                const catalogMeta = formatCatalogMeta(row.category, row.type);

                return (
                  <li
                    key={row.id}
                    className="border-border bg-background rounded-xl border p-4 shadow-sm"
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
                        {catalogMeta ? (
                          <div
                            className="text-muted-foreground mt-1 truncate text-xs"
                            title={catalogMeta}
                          >
                            {catalogMeta}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-foreground shrink-0 text-right text-sm whitespace-nowrap">
                        {priceMinor == null
                          ? '-'
                          : formatMoney(priceMinor, displayCurrency, locale)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {badge ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${productBadgeClass(row.badge)}`}
                        >
                          {badge}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${booleanBadgeClass(row.isActive, 'success')}`}
                      >
                        {row.isActive ? t('states.active') : t('states.hidden')}
                      </span>
                      {row.isFeatured ? (
                        <span className="inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-500">
                          {t('states.featured')}
                        </span>
                      ) : null}
                    </div>

                    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">
                          {t('table.stock')}
                        </dt>
                        <dd className="text-foreground">{row.stock}</dd>
                      </div>

                      <div>
                        <dt className="text-muted-foreground">
                          {t('table.price')}
                        </dt>
                        <dd className="text-foreground whitespace-nowrap">
                          {priceMinor == null
                            ? '-'
                            : formatMoney(priceMinor, displayCurrency, locale)}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-muted-foreground">
                          {t('table.date')}
                        </dt>
                        <dd className="text-foreground">
                          {formatDate(row.createdAt, locale)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Link
                        href={`/shop/products/${row.slug}`}
                        className={ACTION_LINK_CLASS}
                        aria-label={t('actions.viewProduct', {
                          title: row.title,
                        })}
                      >
                        {t('actions.view')}
                      </Link>

                      <Link
                        href={`/admin/shop/products/${row.id}/edit`}
                        className={ACTION_LINK_CLASS}
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
                        className={row.isInUse ? 'col-span-2' : undefined}
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
          <div className="bg-background/80 overflow-x-auto rounded-xl shadow-sm">
            <table className="divide-border w-full table-fixed divide-y text-sm">
              <caption className="sr-only">{t('listCaption')}</caption>
              <colgroup>
                <col className="w-[21rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[5rem]" />
                <col className="w-[11rem]" />
                <col className="w-[6.5rem]" />
                <col className="w-[10.5rem]" />
              </colgroup>
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className={TH_BASE}>
                    {t('table.product')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.price')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.stock')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.status')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.date')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-border divide-y">
                {rows.map(row => {
                  const priceMinor = row.priceMinor;
                  const badge = formatBadge(row.badge);
                  const catalogMeta = formatCatalogMeta(row.category, row.type);

                  return (
                    <tr key={row.id} className="hover:bg-muted/50">
                      <td
                        className={`${TD_BASE} text-foreground max-w-0 font-medium`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="truncate" title={row.title}>
                            {row.title}
                          </div>
                          <div
                            className="text-muted-foreground truncate text-xs font-normal"
                            title={row.slug}
                          >
                            {row.slug}
                          </div>
                          {catalogMeta ? (
                            <div
                              className="text-muted-foreground truncate text-xs font-normal"
                              title={catalogMeta}
                            >
                              {catalogMeta}
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td
                        className={`${TD_BASE} text-foreground whitespace-nowrap`}
                      >
                        {priceMinor == null
                          ? '-'
                          : formatMoney(priceMinor, displayCurrency, locale)}
                      </td>

                      <td
                        className={`${TD_BASE} text-muted-foreground whitespace-nowrap`}
                      >
                        {row.stock}
                      </td>

                      <td className={TD_BASE}>
                        <div className="flex flex-wrap gap-1.5">
                          {badge ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${productBadgeClass(row.badge)}`}
                            >
                              {badge}
                            </span>
                          ) : null}
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${booleanBadgeClass(row.isActive, 'success')}`}
                          >
                            {row.isActive
                              ? t('states.active')
                              : t('states.hidden')}
                          </span>
                          {row.isFeatured ? (
                            <span className="inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-sky-500">
                              {t('states.featured')}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td
                        className={`${TD_BASE} text-muted-foreground whitespace-nowrap`}
                      >
                        {formatDate(row.createdAt, locale)}
                      </td>

                      <td className={TD_BASE}>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Link
                            href={`/shop/products/${row.slug}`}
                            className={ACTION_LINK_CLASS}
                            aria-label={t('actions.viewProduct', {
                              title: row.title,
                            })}
                          >
                            {t('actions.view')}
                          </Link>

                          <Link
                            href={`/admin/shop/products/${row.id}/edit`}
                            className={ACTION_LINK_CLASS}
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
                            className={row.isInUse ? 'col-span-2' : undefined}
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
                      className="text-muted-foreground px-3 py-10 text-center"
                      colSpan={6}
                    >
                      {t('empty')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-border bg-background/80 mt-4 flex min-h-20 items-center rounded-xl border px-4 py-3 shadow-sm">
          <AdminPagination
            basePath="/admin/shop/products"
            page={page}
            hasNext={hasNext}
            className="mt-0 w-full"
          />
        </div>
      </section>
    </main>
  );
}
