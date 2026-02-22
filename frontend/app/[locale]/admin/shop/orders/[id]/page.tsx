import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getAdminOrderDetail } from '@/db/queries/shop/admin-orders';
import { Link } from '@/i18n/routing';
import { issueCsrfToken } from '@/lib/security/csrf';
import {
  type CurrencyCode,
  formatMoney,
  resolveCurrencyFromLocale,
} from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';

import { RefundButton } from './RefundButton';
import { ShippingActions } from './ShippingActions';

export const metadata: Metadata = {
  title: 'Admin Order | DevLovers',
  description: 'Review and manage order, including refunds and status checks.',
};

type ShippingAuditView = {
  action: string;
  at: string;
  fromShippingStatus: string | null;
  toShippingStatus: string | null;
  actorUserId: string | null;
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

function formatDateTime(value: Date | null | undefined, locale: string): string {
  if (!value) return '-';
  return value.toLocaleString(locale);
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function maskName(value: string | null): string {
  if (!value) return '-';
  const v = value.trim();
  if (v.length <= 2) return `${v[0] ?? '*'}*`;
  return `${v.slice(0, 1)}***${v.slice(-1)}`;
}

function maskPhone(value: string | null): string {
  if (!value) return '-';
  const v = value.trim();
  if (v.startsWith('+380') && v.length >= 13) {
    return `${v.slice(0, 4)}******${v.slice(-3)}`;
  }
  if (v.length <= 4) return '**';
  return `${v.slice(0, 2)}***${v.slice(-2)}`;
}

function maskEmail(value: string | null): string {
  if (!value) return '-';
  const v = value.trim();
  const at = v.indexOf('@');
  if (at <= 1) return '***';
  return `${v.slice(0, 1)}***${v.slice(at - 1)}`;
}

function maskAddress(value: string | null): string {
  if (!value) return '-';
  const v = value.trim();
  if (v.length <= 6) return `${v.slice(0, 1)}***`;
  return `${v.slice(0, 6)}***`;
}

function readShippingSnapshot(raw: unknown) {
  if (!isRecord(raw)) {
    return {
      methodCode: null,
      city: null,
      warehouse: null,
      addressLine1: null,
      recipientName: null,
      recipientPhone: null,
      recipientEmail: null,
    };
  }

  const selection = isRecord(raw.selection) ? raw.selection : null;
  const recipient = isRecord(raw.recipient) ? raw.recipient : null;

  const cityName = toStringOrNull(selection?.cityNameUa ?? selection?.cityNameRu);
  const warehouseName = toStringOrNull(selection?.warehouseName);

  return {
    methodCode: toStringOrNull(raw.methodCode),
    city: cityName,
    warehouse: warehouseName,
    addressLine1: toStringOrNull(selection?.addressLine1),
    recipientName: toStringOrNull(recipient?.fullName),
    recipientPhone: toStringOrNull(recipient?.phone),
    recipientEmail: toStringOrNull(recipient?.email),
  };
}

function parseShippingAudit(metadata: unknown, locale: string): ShippingAuditView[] {
  if (!isRecord(metadata)) return [];
  const raw = metadata.shippingAdminAudit;
  if (!Array.isArray(raw)) return [];

  const items: ShippingAuditView[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const atRaw = toStringOrNull(entry.at);
    const at = atRaw ? formatDateTime(new Date(atRaw), locale) : '-';
    items.push({
      action: toStringOrNull(entry.action) ?? 'unknown',
      at,
      fromShippingStatus: toStringOrNull(entry.fromShippingStatus),
      toShippingStatus: toStringOrNull(entry.toShippingStatus),
      actorUserId: toStringOrNull(entry.actorUserId),
    });
  }

  return items.slice(-10).reverse();
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

  const shipping = readShippingSnapshot(order.shippingAddress);
  const shippingAudit = parseShippingAudit(order.pspMetadata, locale);
  const refundCsrfToken = issueCsrfToken('admin:orders:refund');
  const shippingActionCsrfToken = issueCsrfToken('admin:orders:shipping:action');

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

          <RefundButton
            orderId={order.id}
            disabled={!canRefund}
            csrfToken={refundCsrfToken}
          />
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Order details">
        <article
          className="border-border rounded-lg border p-4"
          aria-labelledby="summary-title"
        >
          <h2 id="summary-title" className="text-foreground text-sm font-semibold">
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
          <h2 id="stock-title" className="text-foreground text-sm font-semibold">
            Stock / timestamps
          </h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-foreground">{formatDateTime(order.createdAt, locale)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="text-foreground">{formatDateTime(order.updatedAt, locale)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Stock restored</dt>
              <dd className="text-foreground">{order.stockRestored ? 'Yes' : 'No'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Restocked at</dt>
              <dd className="text-foreground">{formatDateTime(order.restockedAt, locale)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label="Shipping details">
        <article className="border-border rounded-lg border p-4">
          <h2 className="text-foreground text-sm font-semibold">Shipping</h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Required</dt>
              <dd className="text-foreground">{order.shippingRequired ? 'Yes' : 'No'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="text-foreground">{order.shippingProvider ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Method</dt>
              <dd className="text-foreground">{order.shippingMethodCode ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Order shipping status</dt>
              <dd className="text-foreground">{order.shippingStatus ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Shipment status</dt>
              <dd className="text-foreground">{order.shipmentStatus ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tracking number</dt>
              <dd className="text-foreground font-mono text-xs break-all">
                {order.trackingNumber ?? '-'}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Provider ref</dt>
              <dd className="text-foreground font-mono text-xs break-all">
                {order.shippingProviderRef ?? '-'}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Last shipment error</dt>
              <dd className="text-foreground">{order.shipmentLastErrorCode ?? '-'}</dd>
            </div>
          </dl>
        </article>

        <article className="border-border rounded-lg border p-4">
          <h2 className="text-foreground text-sm font-semibold">Recipient (masked)</h2>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Full name</dt>
              <dd className="text-foreground">{maskName(shipping.recipientName)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="text-foreground">{maskPhone(shipping.recipientPhone)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{maskEmail(shipping.recipientEmail)}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">City</dt>
              <dd className="text-foreground">{shipping.city ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Warehouse</dt>
              <dd className="text-foreground">{shipping.warehouse ?? '-'}</dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Courier address</dt>
              <dd className="text-foreground">{maskAddress(shipping.addressLine1)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="border-border mt-6 rounded-lg border p-4" aria-label="Shipping actions">
        <h2 className="text-foreground text-sm font-semibold">Shipping actions</h2>
        <p className="text-muted-foreground mt-2 text-xs">
          Actions are protected by admin auth + CSRF and write safe audit entries
          without PII payload.
        </p>

        <div className="mt-3">
          <ShippingActions
            orderId={order.id}
            csrfToken={shippingActionCsrfToken}
            shippingStatus={order.shippingStatus}
            shipmentStatus={order.shipmentStatus}
          />
        </div>
      </section>

      <section className="border-border mt-6 rounded-lg border p-4" aria-label="Shipping audit">
        <h2 className="text-foreground text-sm font-semibold">Shipping audit (safe)</h2>
        <div className="mt-3">
          {shippingAudit.length === 0 ? (
            <p className="text-muted-foreground text-sm">No shipping admin actions yet.</p>
          ) : (
            <ul className="space-y-2">
              {shippingAudit.map((entry, idx) => (
                <li
                  key={`${entry.action}-${entry.at}-${idx}`}
                  className="bg-muted/40 rounded-md px-3 py-2 text-xs"
                >
                  <div className="text-foreground font-medium">{entry.action}</div>
                  <div className="text-muted-foreground mt-1">
                    {entry.fromShippingStatus ?? '-'} {'->'} {entry.toShippingStatus ?? '-'}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {entry.at} {entry.actorUserId ? `by ${entry.actorUserId}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
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
                const unitMinor = pickMinor(item.unitPriceMinor, item.unitPrice);
                const lineMinor = pickMinor(item.lineTotalMinor, item.lineTotal);

                const unitFormatted =
                  unitMinor === null ? '-' : formatMoney(unitMinor, currency, locale);

                const lineFormatted =
                  lineMinor === null ? '-' : formatMoney(lineMinor, currency, locale);

                return (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2">
                      <div className="text-foreground font-medium">
                        {item.productTitle ?? '-'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <span className="font-mono">{item.productSlug ?? '-'}</span>
                        {item.productSku ? <span> · {item.productSku}</span> : null}
                      </div>
                    </td>

                    <td className="text-muted-foreground px-3 py-2">{item.quantity}</td>

                    <td className="text-foreground px-3 py-2">{unitFormatted}</td>

                    <td className="text-foreground px-3 py-2">{lineFormatted}</td>
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
