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

export const metadata: Metadata = {
  title: 'Admin Orders | DevLovers',
  description: 'View and manage orders in the DevLovers shop catalog.',
};

const PAGE_SIZE = 25;

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
  return value.toLocaleDateString(locale);
}

export default async function AdminOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('shop.admin.orders');
  const csrfToken = issueCsrfToken('admin:orders:reconcile-stale');

  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  const { items: all } = await getAdminOrdersPage({
    limit: PAGE_SIZE + 1,
    offset,
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
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      aria-labelledby="admin-orders-title"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1
          id="admin-orders-title"
          className="text-foreground text-2xl font-bold"
        >
          {t('title')}
        </h1>

        <form action="/api/shop/admin/orders/reconcile-stale" method="post">
          <input type="hidden" name={CSRF_FORM_FIELD} value={csrfToken} />
          <button
            type="submit"
            className="border-border text-foreground hover:bg-secondary inline-flex w-full items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto"
          >
            {t('reconcileStale')}
          </button>
        </form>
      </header>

      <section className="mt-6" aria-label={t('listCaption')}>
        {/* Mobile cards */}
        <div className="md:hidden">
          {viewModels.length === 0 ? (
            <div className="border-border text-muted-foreground rounded-md border p-4 text-sm">
              {t('empty')}
            </div>
          ) : (
            <ul className="space-y-3">
              {viewModels.map(vm => (
                <li
                  key={vm.id}
                  className="border-border bg-background rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-muted-foreground text-xs">
                        {vm.createdAt}
                      </div>
                      <div className="mt-1">
                        <span className="bg-muted text-foreground inline-flex rounded-full px-2 py-1 text-xs font-medium">
                          {vm.paymentStatus}
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
                      className="border-border text-foreground hover:bg-secondary inline-flex items-center justify-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
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
          <div className="overflow-x-auto">
            <table className="divide-border min-w-full divide-y text-sm">
              <caption className="sr-only">{t('listCaption')}</caption>

              <thead className="bg-muted/50">
                <tr>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.created')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.status')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.total')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.items')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.provider')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.orderId')}
                  </th>
                  <th
                    scope="col"
                    className="text-foreground px-3 py-2 text-left font-semibold"
                  >
                    {t('table.actions')}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-border divide-y">
                {viewModels.length === 0 ? (
                  <tr>
                    <td className="text-muted-foreground px-3 py-6" colSpan={7}>
                      {t('empty')}
                    </td>
                  </tr>
                ) : (
                  viewModels.map(vm => (
                    <tr key={vm.id} className="hover:bg-muted/50">
                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                        {vm.createdAt}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="bg-muted text-foreground inline-flex rounded-full px-2 py-1 text-xs font-medium">
                          {vm.paymentStatus}
                        </span>
                      </td>

                      <td className="text-foreground px-3 py-2 whitespace-nowrap">
                        {vm.totalFormatted}
                      </td>

                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                        {vm.itemCount}
                      </td>

                      <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                        {vm.paymentProvider}
                      </td>

                      <td className="text-muted-foreground px-3 py-2 font-mono text-xs break-all">
                        {vm.id}
                      </td>

                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={vm.viewHref}
                          className="border-border text-foreground hover:bg-secondary rounded-md border px-2 py-1 text-xs font-medium transition-colors"
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

        <div className="mt-4">
          <AdminPagination
            basePath="/admin/shop/orders"
            page={page}
            hasNext={hasNext}
          />
        </div>
      </section>
    </main>
  );
}
