// frontend/app/[locale]/shop/admin/orders/page.tsx
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

function pickMinor(minor: unknown, legacyMajor: unknown): number | null {
  if (typeof minor === 'number') return minor;
  if (legacyMajor === null || legacyMajor === undefined) return null;
  return fromDbMoney(legacyMajor);
}

function orderCurrency(order: any, locale: string): CurrencyCode {
  const c = order?.currency ?? resolveCurrencyFromLocale(locale);
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
        <header className="flex items-start justify-between gap-4">
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
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Reconcile stale
            </button>
          </form>
        </header>

        <section className="mt-6" aria-label="Orders table">
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
                    <td className="px-3 py-6 text-muted-foreground" colSpan={7}>
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
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDate(order.createdAt, locale)}
                        </td>

                        <td className="px-3 py-2">
                          <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
                            {order.paymentStatus}
                          </span>
                        </td>

                        <td className="px-3 py-2 text-foreground">
                          {totalFormatted}
                        </td>

                        <td className="px-3 py-2 text-muted-foreground">
                          {order.itemCount}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {order.paymentProvider}
                        </td>

                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                          {order.id}
                        </td>

                        <td className="px-3 py-2">
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
