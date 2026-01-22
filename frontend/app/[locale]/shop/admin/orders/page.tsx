import { Link } from '@/i18n/routing';

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
            Admin · Orders
          </h1>

          <form action="/api/shop/admin/orders/reconcile-stale" method="post">
            <input type="hidden" name={CSRF_FORM_FIELD} value={csrfToken} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:w-auto"
            >
              Reconcile stale
            </button>
          </form>
        </header>

        <section className="mt-6" aria-label="Orders list">
          {/* Mobile cards */}
          <div className="md:hidden">
            {items.length === 0 ? (
              <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                No orders yet.
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map(order => {
                  const currency = orderCurrency(order, locale);
                  const totalMinor = pickMinor(
                    order?.totalAmountMinor,
                    order?.totalAmount
                  );
                  const totalFormatted =
                    totalMinor === null
                      ? '-'
                      : formatMoney(totalMinor, currency, locale);

                  return (
                    <li
                      key={order.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">
                            {formatDate(order.createdAt, locale)}
                          </div>
                          <div className="mt-1">
                            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                              {order.paymentStatus}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 whitespace-nowrap text-right text-sm font-medium text-foreground">
                          {totalFormatted}
                        </div>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Items</dt>
                          <dd className="text-foreground">{order.itemCount}</dd>
                        </div>

                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Provider</dt>
                          <dd
                            className="truncate text-foreground"
                            title={order.paymentProvider ?? '-'}
                          >
                            {order.paymentProvider ?? '-'}
                          </dd>
                        </div>

                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Order ID</dt>
                          <dd
                            className="break-all font-mono text-[11px] text-muted-foreground"
                            title={order.id}
                          >
                            {order.id}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3">
                        <Link
                          href={`/shop/admin/orders/${order.id}`}
                          className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                          aria-label={`View order ${order.id}`}
                        >
                          View
                        </Link>
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
              <table className="min-w-full divide-y divide-border text-sm">
                <caption className="sr-only">Orders list</caption>

                <thead className="bg-muted/50">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Created
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Total
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Items
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Provider
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Order ID
                    </th>
                    <th
                      scope="col"
                      className="px-3 py-2 text-left font-semibold text-foreground"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {items.length === 0 ? (
                    <tr>
                      <td
                        className="px-3 py-6 text-muted-foreground"
                        colSpan={7}
                      >
                        No orders yet.
                      </td>
                    </tr>
                  ) : (
                    items.map(order => {
                      const currency = orderCurrency(order, locale);
                      const totalMinor = pickMinor(
                        order?.totalAmountMinor,
                        order?.totalAmount
                      );
                      const totalFormatted =
                        totalMinor === null
                          ? '-'
                          : formatMoney(totalMinor, currency, locale);

                      return (
                        <tr key={order.id} className="hover:bg-muted/50">
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {formatDate(order.createdAt, locale)}
                          </td>

                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                              {order.paymentStatus}
                            </span>
                          </td>

                          <td className="px-3 py-2 text-foreground whitespace-nowrap">
                            {totalFormatted}
                          </td>

                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {order.itemCount}
                          </td>

                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {order.paymentProvider ?? '-'}
                          </td>

                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                            {order.id}
                          </td>

                          <td className="px-3 py-2 whitespace-nowrap">
                            <Link
                              href={`/shop/admin/orders/${order.id}`}
                              className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                              aria-label={`View order ${order.id}`}
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      );
                    })
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
