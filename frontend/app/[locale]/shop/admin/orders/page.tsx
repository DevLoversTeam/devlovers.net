import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

import { getAdminOrdersPage } from '@/db/queries/shop/admin-orders';
import {
  formatMoney,
  resolveCurrencyFromLocale,
  type CurrencyCode,
} from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import { ShopAdminTopbar } from '@/components/shop/admin/shop-admin-topbar';
import { AdminPagination } from '@/components/shop/admin/admin-pagination';
import { guardShopAdminPage } from '@/lib/auth/guard-shop-admin-page';
import { CSRF_FORM_FIELD, issueCsrfToken } from '@/lib/security/csrf';
import { parsePage } from '@/lib/pagination';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Orders | DevLovers',
  description: 'View and manage orders in the DevLovers shop catalog.',
};


export const dynamic = 'force-dynamic';

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
  await guardShopAdminPage();

  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations('shop.admin.orders');
  const csrfToken = issueCsrfToken('admin:orders:reconcile-stale');

  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // overfetch for hasNext without COUNT
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
      viewHref: `/shop/admin/orders/${order.id}`,
      viewAriaLabel: t('viewOrder', { id: order.id }),
    };
  });

  return (
    <>
      <ShopAdminTopbar />

      <main
        className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        aria-labelledby="admin-orders-title"
      >
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1
            id="admin-orders-title"
            className="text-2xl font-bold text-foreground"
          >
            {t('title')}
          </h1>

          <form action="/api/shop/admin/orders/reconcile-stale" method="post">
            <input type="hidden" name={CSRF_FORM_FIELD} value={csrfToken} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
            >
              {t('reconcileStale')}
            </button>
          </form>
        </header>

        <section className="mt-6" aria-label={t('listCaption')}>
          {/* Mobile cards */}
          <div className="md:hidden">
            {viewModels.length === 0 ? (
              <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                {t('empty')}
              </div>
            ) : (
              <ul className="space-y-3">
                {viewModels.map(vm => (
                  <li
                    key={vm.id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          {vm.createdAt}
                        </div>
                        <div className="mt-1">
                          <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                            {vm.paymentStatus}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-foreground">
                        {vm.totalFormatted}
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">{t('table.items')}</dt>
                        <dd className="text-foreground">{vm.itemCount}</dd>
                      </div>

                      <div className="min-w-0">
                        <dt className="text-muted-foreground">{t('table.provider')}</dt>
                        <dd
                          className="truncate text-foreground"
                          title={vm.paymentProvider}
                        >
                          {vm.paymentProvider}
                        </dd>
                      </div>

                      <div className="col-span-2">
                        <dt className="text-muted-foreground">{t('table.orderId')}</dt>
                        <dd
                          className="break-all font-mono text-[11px] text-muted-foreground"
                          title={vm.id}
                        >
                          {vm.id}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <Link
                        href={vm.viewHref}
                        className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
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
              <table className="min-w-full divide-y divide-border text-sm">
                <caption className="sr-only">{t('listCaption')}</caption>

                <thead className="bg-muted/50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.created')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.status')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.total')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.items')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.provider')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.orderId')}
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      {t('table.actions')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {viewModels.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-6 text-muted-foreground"
                        colSpan={7}
                      >
                        {t('empty')}
                      </td>
                    </tr>
                  ) : (
                    viewModels.map(vm => (
                      <tr key={vm.id} className="hover:bg-muted/50">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {vm.createdAt}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                            {vm.paymentStatus}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-foreground whitespace-nowrap">
                          {vm.totalFormatted}
                        </td>

                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {vm.itemCount}
                        </td>

                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {vm.paymentProvider}
                        </td>

                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                          {vm.id}
                        </td>

                        <td className="px-3 py-2 whitespace-nowrap">
                          <Link
                            href={vm.viewHref}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
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
              basePath="/shop/admin/orders"
              page={page}
              hasNext={hasNext}
            />
          </div>
        </section>
      </main>
    </>
  );
}
