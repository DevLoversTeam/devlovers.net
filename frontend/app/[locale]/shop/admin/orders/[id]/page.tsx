import { Link } from '@/i18n/routing';

import { notFound } from "next/navigation";

import { getAdminOrderDetail } from "@/db/queries/shop/admin-orders";
import { formatMoney, resolveCurrencyFromLocale, type CurrencyCode } from "@/lib/shop/currency";
import { fromDbMoney } from "@/lib/shop/money";

export const dynamic = "force-dynamic";

function pickMinor(minor: unknown, legacyMajor: unknown): number | null {
  if (typeof minor === "number") return minor;
  if (legacyMajor === null || legacyMajor === undefined) return null;
  return fromDbMoney(legacyMajor);
}

function orderCurrency(order: any, locale: string): CurrencyCode {
  return (order?.currency ?? resolveCurrencyFromLocale(locale)) as CurrencyCode;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "-";
  return value.toLocaleString();
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const order = await getAdminOrderDetail(id);
  if (!order) notFound();

  const canRefund = order.paymentStatus === "paid";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Order</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{order.id}</p>
        </div>

        <div className="flex gap-2">
          <Link href="/shop/admin/orders"
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Back
          </Link>

          <form action={`/api/shop/admin/orders/${order.id}/refund`} method="post">
            <button
              type="submit"
              disabled={!canRefund}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              title={!canRefund ? "Refund is only available for paid orders" : undefined}
            >
              Refund
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold text-foreground">Summary</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment status</dt>
              <dd className="text-foreground">{order.paymentStatus}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-foreground">
                {(() => {
                  const c = orderCurrency(order, locale);
                  const totalMinor = pickMinor(order?.totalAmountMinor, order?.totalAmount);
                  return totalMinor === null ? "-" : formatMoney(totalMinor, c, locale);
                })()}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="text-foreground">{order.paymentProvider}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Payment intent</dt>
              <dd className="font-mono text-xs text-muted-foreground">{order.paymentIntentId ?? "-"}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Idempotency key</dt>
              <dd className="font-mono text-xs text-muted-foreground">{order.idempotencyKey}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-semibold text-foreground">Stock / timestamps</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-foreground">{formatDateTime(order.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="text-foreground">{formatDateTime(order.updatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Stock restored</dt>
              <dd className="text-foreground">{order.stockRestored ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Restocked at</dt>
              <dd className="text-foreground">{formatDateTime(order.restockedAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Product</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Qty</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Unit</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Line total</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {order.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/50">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{item.productTitle ?? "-"}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{item.productSlug ?? "-"}</span>
                    {item.productSku ? <span> · {item.productSku}</span> : null}
                  </div>
                </td>

                <td className="px-3 py-2 text-muted-foreground">{item.quantity}</td>

                <td className="px-3 py-2 text-foreground">
                  {(() => {
                    const c = orderCurrency(order, locale);
                    const unitMinor = pickMinor(item?.unitPriceMinor, item?.unitPrice);
                    return unitMinor === null ? "-" : formatMoney(unitMinor, c, locale);
                  })()}
                </td>

                <td className="px-3 py-2 text-foreground">
                  {(() => {
                    const c = orderCurrency(order, locale);
                    const lineMinor = pickMinor(item?.lineTotalMinor, item?.lineTotal);
                    return lineMinor === null ? "-" : formatMoney(lineMinor, c, locale);
                  })()}
                </td>
              </tr>
            ))}

            {order.items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={4}>
                  No items found for this order.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
