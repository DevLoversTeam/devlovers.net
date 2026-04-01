import 'server-only';

import { and, eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { db } from '@/db';
import { orderItems, orders } from '@/db/schema';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logging';
import {
  type CanonicalFulfillmentStage,
  deriveCanonicalFulfillmentStage,
  latestReturnStatusSql,
  latestShipmentStatusSql,
} from '@/lib/services/shop/fulfillment-stage';
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

type OrderCurrency = (typeof orders.$inferSelect)['currency'];
type OrderPaymentStatus = (typeof orders.$inferSelect)['paymentStatus'];
type OrderPaymentProvider = (typeof orders.$inferSelect)['paymentProvider'];

type OrderDetail = {
  id: string;
  userId: string | null;
  totalAmount: string;
  currency: OrderCurrency;
  paymentStatus: OrderPaymentStatus;
  paymentProvider: OrderPaymentProvider;
  paymentIntentId: string | null;
  fulfillmentStage: CanonicalFulfillmentStage;
  shippingStatus: string | null;
  trackingNumber: string | null;
  stockRestored: boolean;
  restockedAt: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

function shortOrderId(id: string) {
  if (!id) return '';
  if (id.length <= 14) return id;
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

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

function safeFormatDateTime(iso: string, dtf: Intl.DateTimeFormat): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return dtf.format(d);
}

function fulfillmentStageLabelKey(stage: CanonicalFulfillmentStage): string {
  return `fulfillmentStages.${stage}`;
}

function fulfillmentStageClassName(stage: CanonicalFulfillmentStage) {
  switch (stage) {
    case 'canceled':
      return 'border border-border bg-destructive/10 text-destructive';
    default:
      return 'border border-border bg-muted/40 text-foreground';
  }
}

function paymentStatusLabel(
  status: OrderPaymentStatus,
  t: Awaited<ReturnType<typeof getTranslations<'shop.orders.detail'>>>
) {
  switch (status) {
    case 'paid':
      return t('paymentStatuses.paid');
    case 'pending':
      return t('paymentStatuses.pending');
    case 'requires_payment':
      return t('paymentStatuses.requiresPayment');
    case 'failed':
      return t('paymentStatuses.failed');
    case 'refunded':
      return t('paymentStatuses.refunded');
    case 'needs_review':
      return t('paymentStatuses.needsReview');
    default:
      return String(status);
  }
}

function paymentStatusClassName(status: OrderPaymentStatus) {
  switch (status) {
    case 'failed':
      return 'border border-border bg-destructive/10 text-destructive';
    default:
      return 'border border-border bg-muted/40 text-foreground';
  }
}

function shippingStatusLabel(
  status: string | null,
  t: Awaited<ReturnType<typeof getTranslations<'shop.orders.detail'>>>
) {
  switch (status) {
    case null:
      return t('deliveryPending');
    case 'pending':
      return t('shippingStatuses.pending');
    case 'queued':
      return t('shippingStatuses.queued');
    case 'creating_label':
      return t('shippingStatuses.creatingLabel');
    case 'label_created':
      return t('shippingStatuses.labelCreated');
    case 'shipped':
      return t('shippingStatuses.shipped');
    case 'delivered':
      return t('shippingStatuses.delivered');
    case 'cancelled':
      return t('shippingStatuses.cancelled');
    case 'needs_attention':
      return t('shippingStatuses.needsAttention');
    default:
      return status;
  }
}

function toOrderItem(
  item: {
    id: string | null;
    productId: string | null;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number | null;
    unitPrice: string | null;
    lineTotal: string | null;
  } | null
): OrderDetail['items'][number] | null {
  if (!item || !item.id) return null;

  if (
    !item.productId ||
    item.quantity === null ||
    !item.unitPrice ||
    !item.lineTotal
  ) {
    throw new Error('Corrupt order item row: required columns are null');
  }

  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.productTitle,
    productSlug: item.productSlug,
    productSku: item.productSku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  noStore();

  const { locale, id } = await params;
  const t = await getTranslations('shop.orders.detail');

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/${locale}/login?returnTo=${encodeURIComponent(
        `/${locale}/shop/orders/${id}`
      )}`
    );
  }

  const parsed = orderIdParamSchema.safeParse({ id });
  if (!parsed.success) notFound();

  const isAdmin = user.role === 'admin';

  let order: OrderDetail;

  const whereClause = isAdmin
    ? eq(orders.id, parsed.data.id)
    : and(eq(orders.id, parsed.data.id), eq(orders.userId, user.id));

  const fetchRows = () =>
    db
      .select({
        order: {
          id: orders.id,
          userId: orders.userId,
          totalAmount: orders.totalAmount,
          currency: orders.currency,
          paymentStatus: orders.paymentStatus,
          paymentProvider: orders.paymentProvider,
          paymentIntentId: orders.paymentIntentId,
          orderStatus: orders.status,
          shippingStatus: orders.shippingStatus,
          shipmentStatus: latestShipmentStatusSql(orders.id),
          returnStatus: latestReturnStatusSql(orders.id),
          trackingNumber: orders.trackingNumber,
          stockRestored: orders.stockRestored,
          restockedAt: orders.restockedAt,
          idempotencyKey: orders.idempotencyKey,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
        },
        item: {
          id: orderItems.id,
          productId: orderItems.productId,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
          lineTotal: orderItems.lineTotal,
        },
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .where(whereClause)
      .orderBy(orderItems.id);

  let rows: Awaited<ReturnType<typeof fetchRows>>;
  try {
    rows = await fetchRows();
  } catch (error) {
    logError('User order detail page failed', error);
    throw new Error('ORDER_DETAIL_LOAD_FAILED');
  }

  if (rows.length === 0) notFound();

  try {
    const base = rows[0]!.order;
    const fulfillmentStage = deriveCanonicalFulfillmentStage({
      orderStatus: base.orderStatus,
      shippingStatus: base.shippingStatus,
      shipmentStatus:
        typeof base.shipmentStatus === 'string' ? base.shipmentStatus : null,
      returnStatus:
        typeof base.returnStatus === 'string' ? base.returnStatus : null,
    });

    const items = rows
      .map(r => toOrderItem(r.item))
      .filter((i): i is NonNullable<typeof i> => i !== null);

    order = {
      id: base.id,
      userId: base.userId,
      totalAmount: base.totalAmount,
      currency: base.currency,
      paymentStatus: base.paymentStatus,
      paymentProvider: base.paymentProvider,
      paymentIntentId: base.paymentIntentId,
      fulfillmentStage,
      shippingStatus: base.shippingStatus,
      trackingNumber: base.trackingNumber,
      stockRestored: base.stockRestored,
      idempotencyKey: base.idempotencyKey,
      createdAt: base.createdAt.toISOString(),
      updatedAt: base.updatedAt.toISOString(),
      restockedAt: base.restockedAt ? base.restockedAt.toISOString() : null,
      items,
    };
  } catch (error) {
    logError('User order detail page failed', error);
    throw new Error('ORDER_DETAIL_LOAD_FAILED');
  }

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
  const paymentStatusFormatted = paymentStatusLabel(order.paymentStatus, t);
  const fulfillmentStageFormatted = t(
    fulfillmentStageLabelKey(order.fulfillmentStage)
  );
  const shippingStatusFormatted = shippingStatusLabel(order.shippingStatus, t);
  const restockedFormatted = order.restockedAt
    ? safeFormatDateTime(order.restockedAt, dtf)
    : '-';
  const NAV_LINK = cn(SHOP_NAV_LINK_BASE, 'text-lg', SHOP_FOCUS);

  const PRODUCT_LINK = cn(
    SHOP_LINK_BASE,
    SHOP_LINK_MD,
    SHOP_FOCUS,
    'block min-w-0 [overflow-wrap:anywhere] whitespace-normal',
    '!underline !decoration-2 !underline-offset-4'
  );

  return (
    <main
      className="mx-auto w-full max-w-3xl px-4 py-8"
      aria-labelledby="order-heading"
    >
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
            {t('orderReference')}
          </p>
          <h1
            id="order-heading"
            className="mt-2 truncate text-2xl font-semibold"
          >
            {t('orderNumber', { id: shortOrderId(order.id) })}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('placedOn', { date: createdFormatted })}
          </p>
        </div>

        <nav
          className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3"
          aria-label="Order navigation"
        >
          <Link className={NAV_LINK} href="/shop/orders">
            {t('myOrders')}
          </Link>
          <Link className={NAV_LINK} href="/shop">
            {t('shop')}
          </Link>
        </nav>
      </header>

      <section
        className="border-border mb-6 rounded-xl border p-4 sm:p-5"
        aria-labelledby="order-summary-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
              {t('customerSummary')}
            </p>
            <h2
              id="order-summary-heading"
              className="mt-2 text-xl font-semibold"
            >
              {t('orderSummary')}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('orderNumberLabel', { id: shortOrderId(order.id) })}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
                fulfillmentStageClassName(order.fulfillmentStage)
              )}
            >
              {fulfillmentStageFormatted}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
                paymentStatusClassName(order.paymentStatus)
              )}
            >
              {paymentStatusFormatted}
            </span>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
              {t('total')}
            </dt>
            <dd className="mt-1 text-base font-semibold">{totalFormatted}</dd>
          </div>

          <div>
            <dt className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
              {t('paymentStatus')}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {paymentStatusFormatted}
            </dd>
          </div>

          <div>
            <dt className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
              {t('fulfillmentStage')}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {fulfillmentStageFormatted}
            </dd>
          </div>

          <div>
            <dt className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
              {t('delivery')}
            </dt>
            <dd className="mt-1 text-sm font-medium">
              {shippingStatusFormatted}
            </dd>
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <dt className="text-muted-foreground text-xs tracking-[0.16em] uppercase">
              {t('trackingNumber')}
            </dt>
            <dd
              className={cn(
                'mt-1 text-sm font-medium',
                order.trackingNumber
                  ? '[overflow-wrap:anywhere] break-words'
                  : 'text-muted-foreground'
              )}
            >
              {order.trackingNumber ?? t('trackingPending')}
            </dd>
          </div>

          {isAdmin && (
            <div>
              <dt className="text-muted-foreground text-xs">{t('provider')}</dt>
              <dd className="text-sm">{String(order.paymentProvider)}</dd>
            </div>
          )}
        </dl>

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('paymentReference')}
              </dt>
              <dd className="text-sm break-all">
                {order.paymentIntentId ?? '-'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('idempotencyKey')}
              </dt>
              <dd className="text-sm break-all">{order.idempotencyKey}</dd>
            </div>
          </dl>
        )}

        {isAdmin && (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('stockRestored')}
              </dt>
              <dd className="text-sm">
                {order.stockRestored ? t('yes') : t('no')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t('restockedAt')}
              </dt>
              <dd className="text-sm">{restockedFormatted}</dd>
            </div>
          </dl>
        )}
      </section>

      <section
        className="border-border rounded-xl border"
        aria-labelledby="order-items-heading"
      >
        <div className="border-border border-b p-4">
          <h2 id="order-items-heading" className="text-lg font-semibold">
            {t('items')}
          </h2>
        </div>

        <ul className="divide-border divide-y" aria-label={t('items')}>
          {order.items.map(it => (
            <li key={it.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {it.productSlug ? (
                    <Link
                      href={`/shop/products/${it.productSlug}`}
                      className={cn(PRODUCT_LINK, 'line-clamp-2 leading-snug')}
                    >
                      {it.productTitle ??
                        it.productSlug ??
                        it.productSku ??
                        it.productId}
                    </Link>
                  ) : (
                    <div className="line-clamp-2 leading-snug font-medium [overflow-wrap:anywhere]">
                      {it.productTitle ?? it.productSku ?? it.productId}
                    </div>
                  )}

                  <div className="text-muted-foreground mt-1 text-xs [overflow-wrap:anywhere]">
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
