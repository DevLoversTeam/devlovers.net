import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { AdminPagination } from '@/components/admin/shop/AdminPagination';
import { getAdminOrdersPage } from '@/db/queries/shop/admin-orders';
import { Link } from '@/i18n/routing';
import { parsePage } from '@/lib/pagination';
import { CSRF_FORM_FIELD, issueCsrfToken } from '@/lib/security/csrf';
import {
  type CurrencyCode,
  formatMoney,
  resolveCurrencyFromLocale,
} from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import { paymentStatusValues } from '@/lib/shop/payments';
import {
  adminOrdersFilterInputSchema,
  EMPTY_ADMIN_ORDERS_FILTERS,
  normalizeAdminOrdersFilters,
} from '@/lib/validation/shop-admin-orders';

export const metadata: Metadata = {
  title: 'Admin Orders | DevLovers',
  description: 'View and manage orders in the DevLovers shop catalog.',
};

const PAGE_SIZE = 25;
const TH_BASE =
  'px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap';
const TD_BASE = 'px-3 py-3 text-sm align-top';
const FIELD_CLASS =
  'h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10';
const PRIMARY_BUTTON_CLASS =
  'inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90';
const SECONDARY_BUTTON_CLASS =
  'inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary';

type AdminOrdersResult = Awaited<ReturnType<typeof getAdminOrdersPage>>;
type AdminOrderRow = AdminOrdersResult['items'][number];

function pickMinor(minor: unknown, legacyMajor: unknown): number | null {
  if (typeof minor === 'number') return minor;
  if (legacyMajor === null || legacyMajor === undefined) return null;
  return fromDbMoney(legacyMajor);
}

function orderCurrency(order: AdminOrderRow, locale: string): CurrencyCode {
  const c = order.currency ?? resolveCurrencyFromLocale(locale);
  return c === 'UAH' ? 'UAH' : 'USD';
}

function formatDate(value: Date | null | undefined, locale: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function formatPaymentStatusLabel(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function paymentStatusBadgeClass(
  status: AdminOrderRow['paymentStatus']
): string {
  if (status === 'paid') return 'bg-emerald-500/10 text-emerald-500';
  if (status === 'failed' || status === 'refunded') {
    return 'bg-rose-500/10 text-rose-500';
  }
  if (status === 'needs_review') return 'bg-amber-500/10 text-amber-500';
  if (status === 'requires_payment') return 'bg-sky-500/10 text-sky-500';
  return 'bg-muted text-muted-foreground';
}

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    status?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('shop.admin.orders');
  const csrfToken = issueCsrfToken('admin:orders:reconcile-stale');

  const page = parsePage(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const offset = (page - 1) * PAGE_SIZE;
  const parsedFilters = adminOrdersFilterInputSchema.safeParse({
    status: sp.status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
  });
  const filters = parsedFilters.success
    ? normalizeAdminOrdersFilters(parsedFilters.data)
    : EMPTY_ADMIN_ORDERS_FILTERS;

  const { items: all } = await getAdminOrdersPage({
    limit: PAGE_SIZE + 1,
    offset,
    ...filters,
  });

  const hasNext = all.length > PAGE_SIZE;
  const items = all.slice(0, PAGE_SIZE);

  const viewModels = items.map(order => {
    const currency = orderCurrency(order, locale);
    const totalMinor = pickMinor(order?.totalAmountMinor, order?.totalAmount);

    return {
      id: order.id,
      createdAt: formatDate(order.createdAt, locale),
      paymentStatus: order.paymentStatus,
      paymentStatusLabel: formatPaymentStatusLabel(order.paymentStatus),
      totalFormatted:
        totalMinor === null ? '-' : formatMoney(totalMinor, currency, locale),
      itemCount: order.itemCount,
      paymentProvider: order.paymentProvider ?? '-',
      viewHref: `/admin/shop/orders/${order.id}`,
      viewAriaLabel: t('viewOrder', { id: order.id }),
    };
  });

  return (
    <main
      className="mx-auto max-w-6xl px-6 py-8"
      aria-labelledby="admin-orders-title"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1
            id="admin-orders-title"
            className="text-foreground text-2xl font-bold"
          >
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('subtitle')}</p>
        </div>

        <form action="/api/shop/admin/orders/reconcile-stale" method="post">
          <input type="hidden" name={CSRF_FORM_FIELD} value={csrfToken} />
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            {t('reconcileStale')}
          </button>
        </form>
      </header>

      <section className="mt-6" aria-label={t('listCaption')}>
        <form
          className="border-border bg-background/80 mb-6 grid gap-3 rounded-xl border p-4 shadow-sm md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
          method="get"
          aria-label={t('filters.label')}
        >
          <div className="grid gap-1">
            <label
              htmlFor="admin-orders-status"
              className="text-foreground text-sm font-medium"
            >
              {t('filters.status')}
            </label>
            <select
              id="admin-orders-status"
              name="status"
              defaultValue={filters.status ?? ''}
              className={FIELD_CLASS}
            >
              <option value="">{t('filters.allStatuses')}</option>
              {paymentStatusValues.map(status => (
                <option key={status} value={status}>
                  {formatPaymentStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1">
            <label
              htmlFor="admin-orders-date-from"
              className="text-foreground text-sm font-medium"
            >
              {t('filters.dateFrom')}
            </label>
            <input
              id="admin-orders-date-from"
              name="dateFrom"
              type="date"
              defaultValue={filters.dateFrom ?? ''}
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid gap-1">
            <label
              htmlFor="admin-orders-date-to"
              className="text-foreground text-sm font-medium"
            >
              {t('filters.dateTo')}
            </label>
            <input
              id="admin-orders-date-to"
              name="dateTo"
              type="date"
              defaultValue={filters.dateTo ?? ''}
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2 md:justify-end">
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              {t('filters.apply')}
            </button>
            <Link href="/admin/shop/orders" className={SECONDARY_BUTTON_CLASS}>
              {t('filters.reset')}
            </Link>
          </div>
        </form>

        {/* Mobile cards */}
        <div className="md:hidden">
          {viewModels.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              {t('empty')}
            </div>
          ) : (
            <ul className="space-y-3">
              {viewModels.map(vm => (
                <li
                  key={vm.id}
                  className="border-border bg-background rounded-xl border p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-muted-foreground text-xs">
                        {vm.createdAt}
                      </div>
                      <div className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(vm.paymentStatus)}`}
                        >
                          {vm.paymentStatusLabel}
                        </span>
                      </div>
                    </div>

                    <div className="text-foreground shrink-0 text-right text-sm font-medium whitespace-nowrap">
                      {vm.totalFormatted}
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">
                        {t('table.items')}
                      </dt>
                      <dd className="text-foreground">{vm.itemCount}</dd>
                    </div>

                    <div className="min-w-0">
                      <dt className="text-muted-foreground">
                        {t('table.provider')}
                      </dt>
                      <dd
                        className="text-foreground truncate"
                        title={vm.paymentProvider}
                      >
                        {vm.paymentProvider}
                      </dd>
                    </div>

                    <div className="col-span-2">
                      <dt className="text-muted-foreground">
                        {t('table.orderId')}
                      </dt>
                      <dd
                        className="text-muted-foreground font-mono text-[11px] break-all"
                        title={vm.id}
                      >
                        {vm.id}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3">
                    <Link
                      href={vm.viewHref}
                      className="border-border text-foreground hover:bg-secondary inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors"
                      aria-label={vm.viewAriaLabel}
                    >
                      {t('actions.view')}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <div className="border-border bg-background/80 overflow-hidden rounded-xl border shadow-sm">
            <table className="divide-border min-w-full divide-y text-sm">
              <caption className="sr-only">{t('listCaption')}</caption>

              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className={TH_BASE}>
                    {t('table.created')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.status')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.total')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.items')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.provider')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.orderId')}
                  </th>
                  <th scope="col" className={TH_BASE}>
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-border divide-y">
                {viewModels.length === 0 ? (
                  <tr>
                    <td
                      className="text-muted-foreground px-3 py-10 text-center"
                      colSpan={7}
                    >
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  viewModels.map(vm => (
                    <tr key={vm.id} className="hover:bg-muted/50">
                      <td
                        className={`${TD_BASE} text-muted-foreground whitespace-nowrap`}
                      >
                        {vm.createdAt}
                      </td>

                      <td className={`${TD_BASE} whitespace-nowrap`}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${paymentStatusBadgeClass(vm.paymentStatus)}`}
                        >
                          {vm.paymentStatusLabel}
                        </span>
                      </td>

                      <td
                        className={`${TD_BASE} text-foreground whitespace-nowrap`}
                      >
                        {vm.totalFormatted}
                      </td>

                      <td
                        className={`${TD_BASE} text-muted-foreground whitespace-nowrap`}
                      >
                        {vm.itemCount}
                      </td>

                      <td
                        className={`${TD_BASE} text-muted-foreground whitespace-nowrap`}
                      >
                        {vm.paymentProvider}
                      </td>

                      <td
                        className={`${TD_BASE} text-muted-foreground font-mono text-xs break-all`}
                      >
                        {vm.id}
                      </td>

                      <td className={`${TD_BASE} whitespace-nowrap`}>
                        <Link
                          href={vm.viewHref}
                          className="border-border text-foreground hover:bg-secondary inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors"
                          aria-label={vm.viewAriaLabel}
                        >
                          {t('actions.view')}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-border bg-background/80 mt-4 rounded-xl border px-4 py-3 shadow-sm">
          <AdminPagination
            basePath="/admin/shop/orders"
            page={page}
            hasNext={hasNext}
            query={{
              status: filters.status,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }}
          />
        </div>
      </section>
    </main>
  );
}
