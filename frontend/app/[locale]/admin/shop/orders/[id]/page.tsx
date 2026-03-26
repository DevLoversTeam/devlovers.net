import 'server-only';

import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  type AdminOrderDetail,
  getAdminOrderDetail,
} from '@/db/queries/shop/admin-orders';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logging';
import { type CurrencyCode, formatMoney } from '@/lib/shop/currency';
import { fromDbMoney } from '@/lib/shop/money';
import {
  SHOP_FOCUS,
  SHOP_LINK_BASE,
  SHOP_LINK_MD,
  SHOP_NAV_LINK_BASE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const metadata: Metadata = {
  title: 'Order Details | DevLovers',
  description: 'Order details, items, totals, and current status.',
};
export const dynamic = 'force-dynamic';

const DASH = '-';

type NormalizedCustomerSummary = {
  accountName: string | null;
  accountEmail: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  recipientComment: string | null;
  shippingProvider: string | null;
  shippingMethod: string | null;
  city: string | null;
  pickupPoint: string | null;
  address: string | null;
};

function safeFormatMoneyMajor(
  major: string,
  currency: CurrencyCode,
  locale: string
): string {
  try {
    return formatMoney(fromDbMoney(major), currency, locale);
  } catch {
    return `${major} ${currency}`;
  }
}

function safeFormatDateTime(
  value: Date | string | null,
  dtf: Intl.DateTimeFormat
): string {
  if (!value) return DASH;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dtf.format(date);
}

function fulfillmentStageLabelKey(
  stage: AdminOrderDetail['fulfillmentStage']
): string {
  return `fulfillmentStages.${stage}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function joinNonEmpty(values: Array<string | null | undefined>): string | null {
  const parts = values.filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0
  );

  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeCustomerSummary(
  order: AdminOrderDetail
): NormalizedCustomerSummary {
  const root = isRecord(order.shippingAddress) ? order.shippingAddress : {};
  const selection = isRecord(root.selection) ? root.selection : {};
  const recipient = isRecord(root.recipient) ? root.recipient : {};

  const city = firstNonEmpty(
    toStringOrNull(selection.cityNameUa),
    toStringOrNull(selection.cityNameRu),
    toStringOrNull(selection.cityRef)
  );

  const pickupPoint = firstNonEmpty(
    toStringOrNull(selection.warehouseName),
    toStringOrNull(selection.warehouseRef)
  );

  const address = joinNonEmpty([
    toStringOrNull(selection.addressLine1),
    toStringOrNull(selection.addressLine2),
  ]);

  return {
    accountName: order.customerAccountName,
    accountEmail: order.customerAccountEmail,
    recipientName: toStringOrNull(recipient.fullName),
    recipientPhone: toStringOrNull(recipient.phone),
    recipientEmail: toStringOrNull(recipient.email),
    recipientComment: toStringOrNull(recipient.comment),
    shippingProvider: firstNonEmpty(
      order.shippingProvider,
      toStringOrNull(root.provider)
    ),
    shippingMethod: firstNonEmpty(
      order.shippingMethodCode,
      toStringOrNull(root.methodCode)
    ),
    city,
    pickupPoint,
    address,
  };
}

function detailValue(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : DASH;
}

function humanizeShippingProvider(
  value: string | null,
  t: (key: string) => string
): string {
  if (value === 'nova_poshta') return t('shippingProviders.novaPoshta');
  return detailValue(value);
}

function humanizeShippingMethod(
  value: string | null,
  t: (key: string) => string
): string {
  switch (value) {
    case 'NP_WAREHOUSE':
      return t('shippingMethods.novaPoshtaWarehouse');
    case 'NP_LOCKER':
      return t('shippingMethods.novaPoshtaLocker');
    case 'NP_COURIER':
      return t('shippingMethods.novaPoshtaCourier');
    default:
      return detailValue(value);
  }
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const t = await getTranslations('shop.orders.detail');

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/${locale}/login?returnTo=${encodeURIComponent(
        `/${locale}/admin/shop/orders/${id}`
      )}`
    );
  }

  const parsed = orderIdParamSchema.safeParse({ id });
  if (!parsed.success) notFound();

  if (user.role !== 'admin') notFound();

  let order: AdminOrderDetail | null;

  try {
    order = await getAdminOrderDetail(parsed.data.id);
  } catch (error) {
    logError('Admin order detail page failed', error);
    throw new Error('ORDER_DETAIL_LOAD_FAILED');
  }

  if (!order) notFound();

  const customerSummary = normalizeCustomerSummary(order);
  const currency: CurrencyCode = order.currency === 'UAH' ? 'UAH' : 'USD';
  const dtf = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const totalFormatted = safeFormatMoneyMajor(
    order.totalAmount,
    currency,
    locale
  );
  const createdFormatted = safeFormatDateTime(order.createdAt, dtf);
  const restockedFormatted = safeFormatDateTime(order.restockedAt, dtf);
  const shippingProviderLabel = humanizeShippingProvider(
    customerSummary.shippingProvider,
    t
  );
  const shippingMethodLabel = humanizeShippingMethod(
    customerSummary.shippingMethod,
    t
  );
  const NAV_LINK = cn(SHOP_NAV_LINK_BASE, 'text-lg', SHOP_FOCUS);

  const PRODUCT_LINK = cn(
    SHOP_LINK_BASE,
    SHOP_LINK_MD,
    SHOP_FOCUS,
    'truncate',
    '!underline !decoration-2 !underline-offset-4'
  );

  return (
    <main
      className="mx-auto w-full max-w-5xl px-6 py-8"
      aria-labelledby="order-heading"
    >
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            id="order-heading"
            className="text-foreground truncate text-2xl font-semibold"
          >
            {t('title')}
          </h1>
          <div className="text-muted-foreground mt-1 truncate text-xs">
            {order.id}
          </div>
        </div>

        <nav
          className="flex flex-wrap items-center justify-end gap-3"
          aria-label="Order navigation"
        >
          <Link className={NAV_LINK} href="/admin/shop/orders">
            {t('myOrders')}
          </Link>
          <Link className={NAV_LINK} href="/admin/shop">
            {t('shop')}
          </Link>
        </nav>
      </header>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <section
          className="border-border bg-background/80 rounded-xl border p-4 shadow-sm"
          aria-labelledby="order-summary-heading"
        >
          <h2
            id="order-summary-heading"
            className="text-foreground text-lg font-semibold"
          >
            {t('orderSummary')}
          </h2>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">{t('total')}</dt>
              <dd className="text-sm font-medium">{totalFormatted}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('paymentStatus')}
              </dt>
              <dd className="text-sm font-medium">
                {String(order.paymentStatus)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('fulfillmentStage')}
              </dt>
              <dd className="text-sm font-medium">
                {t(fulfillmentStageLabelKey(order.fulfillmentStage))}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('shippingStatus')}
              </dt>
              <dd className="text-sm font-medium">
                {detailValue(order.shippingStatus)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('trackingNumber')}
              </dt>
              <dd className="text-sm font-medium break-all">
                {detailValue(order.trackingNumber)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">{t('created')}</dt>
              <dd className="text-sm">{createdFormatted}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">{t('provider')}</dt>
              <dd className="text-sm">{String(order.paymentProvider)}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('paymentReference')}
              </dt>
              <dd className="text-sm break-all">
                {detailValue(order.paymentIntentId)}
              </dd>
            </div>
          </dl>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('idempotencyKey')}
              </dt>
              <dd className="text-sm break-all">{order.idempotencyKey}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('stockRestored')}
              </dt>
              <dd className="text-sm">
                {order.stockRestored ? t('yes') : t('no')}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">
                {t('restockedAt')}
              </dt>
              <dd className="text-sm">{restockedFormatted}</dd>
            </div>
          </dl>
        </section>

        <section
          className="border-border bg-background/80 rounded-xl border p-4 shadow-sm"
          aria-labelledby="customer-summary-heading"
        >
          <h2
            id="customer-summary-heading"
            className="text-foreground text-lg font-semibold"
          >
            {t('customerSummary')}
          </h2>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('customerAccount')}
              </dt>
              <dd className="text-sm">
                {order.userId ? (
                  customerSummary.accountEmail ? (
                    <div className="min-w-0">
                      <div className="font-medium">
                        {customerSummary.accountName ??
                          customerSummary.accountEmail}
                      </div>
                      {customerSummary.accountName ? (
                        <div className="text-muted-foreground break-all text-xs">
                          {customerSummary.accountEmail}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    t('accountUnavailable')
                  )
                ) : (
                  t('guest')
                )}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('recipientName')}
              </dt>
              <dd className="text-sm">
                {detailValue(customerSummary.recipientName)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('recipientPhone')}
              </dt>
              <dd className="text-sm">
                {detailValue(customerSummary.recipientPhone)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('recipientEmail')}
              </dt>
              <dd className="text-sm break-all">
                {detailValue(customerSummary.recipientEmail)}
              </dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('shippingProviderLabel')}
              </dt>
              <dd className="text-sm">{shippingProviderLabel}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('shippingMethod')}
              </dt>
              <dd className="text-sm">{shippingMethodLabel}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">{t('city')}</dt>
              <dd className="text-sm">{detailValue(customerSummary.city)}</dd>
            </div>

            <div>
              <dt className="text-muted-foreground text-xs">
                {t('pickupPoint')}
              </dt>
              <dd className="text-sm">
                {detailValue(customerSummary.pickupPoint)}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">{t('address')}</dt>
              <dd className="text-sm">
                {detailValue(customerSummary.address)}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">{t('comment')}</dt>
              <dd className="text-sm">
                {detailValue(customerSummary.recipientComment)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section
        className="border-border bg-background/80 rounded-xl border shadow-sm"
        aria-labelledby="order-items-heading"
      >
        <div className="border-border border-b p-4">
          <h2
            id="order-items-heading"
            className="text-foreground text-lg font-semibold"
          >
            {t('items')}
          </h2>
        </div>

        <ul className="divide-border divide-y" aria-label={t('items')}>
          {order.items.map(it => (
            <li key={it.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {it.productSlug ? (
                    <Link
                      href={`/shop/products/${it.productSlug}`}
                      className={PRODUCT_LINK}
                    >
                      {it.productTitle ??
                        it.productSlug ??
                        it.productSku ??
                        it.productId}
                    </Link>
                  ) : (
                    <div className="truncate font-medium">
                      {it.productTitle ?? it.productSku ?? it.productId}
                    </div>
                  )}

                  <div className="text-muted-foreground mt-1 text-xs break-all">
                    {it.productSku
                      ? t('sku', { sku: it.productSku })
                      : t('product', { productId: it.productId })}
                  </div>
                </div>

                <dl className="flex flex-col items-start gap-1 sm:items-end">
                  <div>
                    <dt className="sr-only">{t('quantity')}</dt>
                    <dd className="text-sm">
                      {t('qtyShort')}: {it.quantity}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('unitPrice')}</dt>
                    <dd className="text-muted-foreground text-sm">
                      {t('unitShort')}:{' '}
                      {safeFormatMoneyMajor(it.unitPrice, currency, locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">{t('lineTotal')}</dt>
                    <dd className="text-sm font-medium">
                      {t('lineShort')}:{' '}
                      {safeFormatMoneyMajor(it.lineTotal, currency, locale)}
                    </dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
