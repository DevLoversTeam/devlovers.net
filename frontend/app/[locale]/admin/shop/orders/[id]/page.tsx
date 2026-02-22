import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getAdminOrderDetail } from '@/db/queries/shop/admin-orders';
import { Link } from '@/i18n/routing';
import {
  type CurrencyCode,
  formatMoney,
  resolveCurrencyFromLocale,
} from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';

import { RefundButton } from './RefundButton';

export const metadata: Metadata = {
  title: 'Admin Order | DevLovers',
  description: 'Review and manage order, including refunds and status checks.',
};

function pickMinor(minor: unknown, legacyMajor: unknown): number | null {
  if (typeof minor === 'number') return minor;
  if (legacyMajor === null || legacyMajor === undefined) return null;
  return fromDbMoney(legacyMajor);
}

function orderCurrency(
  order: { currency?: string | null },
  locale: string
): CurrencyCode {
  const c = order.currency ?? resolveCurrencyFromLocale(locale);
  return c === 'UAH' ? 'UAH' : 'USD';
}

function formatDateTime(
  value: Date | null | undefined,
  locale: string
): string {
  if (!value) return '-';
  return value.toLocaleString(locale);
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;

  const order = await getAdminOrderDetail(id);
  if (!order) notFound();

  const canRefund =
    order.paymentProvider === 'stripe' &&
    order.paymentStatus === 'paid' &&
    !!order.paymentIntentId;

  const currency = orderCurrency(order, locale);

  const totalMinor = pickMinor(order.totalAmountMinor, order.totalAmount);
  const totalFormatted =
    totalMinor === null ? '-' : formatMoney(totalMinor, currency, locale);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8" aria-labelledby="order-title">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 id="order-title" className="text-foreground text-2xl font-bold">
            Order
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
            {order.id}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/admin/shop/orders"
            className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          >
            Back
          </Link>

          <RefundButton orderId={order.id} disabled={!canRefund} />
        </div>
      </header>

      <section
        className="mt-6 grid gap-4 md:grid-cols-2"
        aria-label="Order details"
      >
        <article
          className="border-border rounded-lg border p-4"
          aria-labelledby="summary-title"
        >
          <h2
            id="summary-title"
            className="text-foreground text-sm font-semibold"
          >
            Summary
          </h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment status</dt>
              <dd className="text-foreground">{order.paymentStatus}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-foreground">{totalFormatted}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="text-foreground">{order.paymentProvider}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment intent</dt>
              <dd className="text-muted-foreground font-mono text-xs break-all">
                {order.paymentIntentId ?? '-'}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Idempotency key</dt>
              <dd className="text-muted-foreground font-mono text-xs break-all">
                {order.idempotencyKey}
              </dd>
            </div>
          </dl>
        </article>

        <article
          className="border-border rounded-lg border p-4"
          aria-labelledby="stock-title"
        >
          <h2
            id="stock-title"
            className="text-foreground text-sm font-semibold"
          >
            Stock / timestamps
          </h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-foreground">
                {formatDateTime(order.createdAt, locale)}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="text-foreground">
                {formatDateTime(order.updatedAt, locale)}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Stock restored</dt>
              <dd className="text-foreground">
                {order.stockRestored ? 'Yes' : 'No'}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Restocked at</dt>
              <dd className="text-foreground">
                {formatDateTime(order.restockedAt, locale)}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="mt-6" aria-labelledby="items-title">
        <h2 id="items-title" className="sr-only">
          Order items
        </h2>

        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="divide-border min-w-full divide-y text-sm">
            <caption className="sr-only">Line items for this order</caption>

            <thead className="bg-muted/50">
              <tr>
                <th
                  scope="col"
                  className="text-foreground px-3 py-2 text-left font-semibold"
                >
                  Product
                </th>
                <th
                  scope="col"
                  className="text-foreground px-3 py-2 text-left font-semibold"
                >
                  Qty
                </th>
                <th
                  scope="col"
                  className="text-foreground px-3 py-2 text-left font-semibold"
                >
                  Unit
                </th>
                <th
                  scope="col"
                  className="text-foreground px-3 py-2 text-left font-semibold"
                >
                  Line total
                </th>
              </tr>
            </thead>

            <tbody className="divide-border divide-y">
              {order.items.map(item => {
                const unitMinor = pickMinor(
                  item.unitPriceMinor,
                  item.unitPrice
                );
                const lineMinor = pickMinor(
                  item.lineTotalMinor,
                  item.lineTotal
                );

                const unitFormatted =
                  unitMinor === null
                    ? '-'
                    : formatMoney(unitMinor, currency, locale);

                const lineFormatted =
                  lineMinor === null
                    ? '-'
                    : formatMoney(lineMinor, currency, locale);

                return (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2">
                      <div className="text-foreground font-medium">
                        {item.productTitle ?? '-'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <span className="font-mono">
                          {item.productSlug ?? '-'}
                        </span>
                        {item.productSku ? (
                          <span> · {item.productSku}</span>
                        ) : null}
                      </div>
                    </td>

                    <td className="text-muted-foreground px-3 py-2">
                      {item.quantity}
                    </td>

                    <td className="text-foreground px-3 py-2">
                      {unitFormatted}
                    </td>

                    <td className="text-foreground px-3 py-2">
                      {lineFormatted}
                    </td>
                  </tr>
                );
              })}

              {order.items.length === 0 ? (
                <tr>
                  <td className="text-muted-foreground px-3 py-6" colSpan={4}>
                    No items found for this order.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
