import 'server-only';

import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  type AdminOrderDetail,
  type AdminOrderHistoryEntry,
  getAdminOrderDetail,
  getAdminOrderTimeline,
} from '@/db/queries/shop/admin-orders';
import { Link } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logging';
import { CSRF_FORM_FIELD, issueCsrfToken } from '@/lib/security/csrf';
import { getAdminOrderLifecycleAvailability } from '@/lib/services/shop/admin-order-lifecycle';
import { evaluateOrderShippingEligibility } from '@/lib/services/shop/shipping/eligibility';
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

import { CancelPaymentButton } from './CancelPaymentButton';
import { RefundButton } from './RefundButton';
import { ShippingActions } from './ShippingActions';
import { getAdminOrderShippingActionVisibility } from './shippingActionVisibility';

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
  return humanizeCode(value);
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
      return humanizeCode(value);
  }
}

function humanizeCode(value: string | null): string {
  if (!value || value.trim().length === 0) return DASH;

  return value
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function humanizePaymentStatus(
  value: string | null,
  t: (key: string) => string
): string {
  switch (value) {
    case 'pending':
      return t('pending');
    case 'requires_payment':
      return t('requiresPayment');
    case 'paid':
      return t('paid');
    case 'failed':
      return t('failed');
    case 'refunded':
      return t('refunded');
    case 'needs_review':
      return t('needsReview');
    default:
      return humanizeCode(value);
  }
}

function humanizePaymentProvider(
  value: string | null,
  t: (key: string) => string
): string {
  switch (value) {
    case 'stripe':
      return t('paymentProviders.stripe');
    case 'monobank':
      return t('paymentProviders.monobank');
    default:
      return humanizeCode(value);
  }
}

function humanizeShippingStatus(
  value: string | null,
  t: (key: string) => string
): string {
  switch (value) {
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
      return humanizeCode(value);
  }
}

function humanizeShipmentStatus(
  value: string | null,
  t: (key: string) => string
): string {
  switch (value) {
    case 'queued':
      return t('shipmentStatuses.queued');
    case 'created':
      return t('shipmentStatuses.created');
    case 'succeeded':
      return t('shipmentStatuses.succeeded');
    case 'failed':
      return t('shipmentStatuses.failed');
    case 'needs_attention':
      return t('shipmentStatuses.needsAttention');
    default:
      return humanizeCode(value);
  }
}

function historyActionLabel(
  action: AdminOrderHistoryEntry['action'],
  t: (key: string, values?: Record<string, string | number | Date>) => string
): string {
  switch (action) {
    case 'confirm':
      return t('history.actions.confirm');
    case 'cancel':
      return t('history.actions.cancel');
    case 'complete':
      return t('history.actions.complete');
    case 'refund':
      return t('history.actions.refund');
    case 'cancel_payment':
      return t('history.actions.cancelPayment');
    case 'recover_initial_shipment':
      return t('history.actions.recoverInitialShipment');
    case 'retry_label_creation':
      return t('history.actions.retryLabelCreation');
    case 'mark_shipped':
      return t('history.actions.markShipped');
    case 'mark_delivered':
      return t('history.actions.markDelivered');
    default:
      return action;
  }
}

function renderHistoryActor(
  entry: AdminOrderHistoryEntry,
  t: (key: string, values?: Record<string, string | number | Date>) => string
) {
  if (entry.actorEmail) {
    return (
      <div className="min-w-0">
        <div className="truncate font-medium">
          {entry.actorName ?? entry.actorEmail}
        </div>
        {entry.actorName ? (
          <div className="text-muted-foreground truncate text-xs">
            {entry.actorEmail}
          </div>
        ) : null}
      </div>
    );
  }

  if (entry.actorName) {
    return <span className="font-medium">{entry.actorName}</span>;
  }

  if (entry.actorUserId) {
    return <span className="font-medium">{t('history.adminUser')}</span>;
  }

  return <span className="font-medium">{t('history.system')}</span>;
}

function lifecycleErrorMessageKey(code: string | null): string | null {
  if (!code) return null;

  switch (code) {
    case 'ORDER_CONFIRM_REQUIRES_PAID_PAYMENT':
      return 'lifecycle.errors.confirmRequiresPaid';
    case 'ORDER_CONFIRM_NOT_ALLOWED':
    case 'ORDER_CONFIRM_INVENTORY_NOT_READY':
      return 'lifecycle.errors.confirmNotAllowed';
    case 'ORDER_CANCEL_REQUIRES_REFUND':
      return 'lifecycle.errors.cancelRequiresRefund';
    case 'ORDER_COMPLETE_REQUIRES_SHIPPING':
      return 'lifecycle.errors.completeRequiresShipping';
    case 'ORDER_COMPLETE_NOT_ALLOWED':
    case 'ORDER_COMPLETE_SHIPMENT_STATE_INCOMPATIBLE':
      return 'lifecycle.errors.completeNotAllowed';
    case 'CSRF_REJECTED':
      return 'lifecycle.errors.csrfRejected';
    case 'INVALID_PAYLOAD':
      return 'lifecycle.errors.invalidPayload';
    case 'INTERNAL_ERROR':
      return 'lifecycle.errors.internalError';
    default:
      return 'lifecycle.errors.generic';
  }
}

function paymentControlsEnabled(order: AdminOrderDetail): {
  refund: boolean;
  cancelPayment: boolean;
} {
  return {
    refund:
      order.paymentProvider === 'stripe' && order.paymentStatus === 'paid',
    cancelPayment:
      order.paymentProvider === 'monobank' &&
      (order.paymentStatus === 'pending' ||
        order.paymentStatus === 'requires_payment') &&
      order.status !== 'PAID' &&
      order.status !== 'CANCELED',
  };
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ lifecycleError?: string | string[] }>;
}) {
  const { locale, id } = await params;
  const sp = searchParams ? await searchParams : {};
  const t = await getTranslations('shop.orders.detail');
  const paymentStatusT = await getTranslations('shop.orders.paymentStatus');
  const lifecycleCsrfToken = issueCsrfToken('admin:orders:lifecycle');
  const shippingCsrfToken = issueCsrfToken('admin:orders:shipping:action');
  const refundCsrfToken = issueCsrfToken('admin:orders:refund');
  const cancelPaymentCsrfToken = issueCsrfToken('admin:orders:cancel-payment');

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
  let history: AdminOrderHistoryEntry[];

  try {
    [order, history] = await Promise.all([
      getAdminOrderDetail(parsed.data.id),
      getAdminOrderTimeline(parsed.data.id),
    ]);
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
  const enabled = getAdminOrderLifecycleAvailability({
    status: order.status,
    paymentStatus: order.paymentStatus,
    inventoryStatus: order.inventoryStatus,
    shippingRequired: order.shippingRequired,
    shippingProvider: order.shippingProvider,
    shippingMethodCode: order.shippingMethodCode,
    shippingStatus: order.shippingStatus,
    pspStatusReason: order.pspStatusReason,
    stockRestored: order.stockRestored,
    shipmentStatus: order.shipmentStatus,
  });
  const shippingReady =
    order.shippingRequired === true &&
    order.shippingProvider === 'nova_poshta' &&
    !!order.shippingMethodCode &&
    evaluateOrderShippingEligibility({
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      inventoryStatus: order.inventoryStatus,
      pspStatusReason: order.pspStatusReason,
    }).ok;
  const shippingEnabled = getAdminOrderShippingActionVisibility({
    shippingReady,
    shippingStatus: order.shippingStatus,
    shipmentStatus: order.shipmentStatus,
  });
  const paymentEnabled = paymentControlsEnabled(order);
  const lifecycleErrorCode = Array.isArray(sp.lifecycleError)
    ? (sp.lifecycleError[0] ?? null)
    : (sp.lifecycleError ?? null);
  const lifecycleErrorKey = lifecycleErrorMessageKey(lifecycleErrorCode);
  const visibleLifecycle = {
    confirm: enabled.confirm,
    cancel: enabled.cancel,
    complete: enabled.complete && !shippingEnabled.markDelivered,
  };
  const showLifecycleActions =
    visibleLifecycle.confirm ||
    visibleLifecycle.cancel ||
    visibleLifecycle.complete ||
    lifecycleErrorKey !== null;
  const showShippingActions =
    shippingEnabled.recoverInitialShipment ||
    shippingEnabled.retryLabelCreation ||
    shippingEnabled.markShipped ||
    shippingEnabled.markDelivered;
  const showPaymentActions =
    paymentEnabled.refund || paymentEnabled.cancelPayment;
  const showOperationalActions =
    showLifecycleActions || showShippingActions || showPaymentActions;
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

      <section
        className="border-border bg-background/80 mb-6 rounded-2xl border p-5 shadow-sm"
        aria-labelledby="order-actions-heading"
      >
        <div>
          <h2
            id="order-actions-heading"
            className="text-foreground text-lg font-semibold"
          >
            {t('actions.heading')}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t('actions.subtitle')}
          </p>
        </div>

        {showOperationalActions ? (
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {showLifecycleActions ? (
              <section className="border-border bg-muted/10 rounded-xl border p-4">
                <div className="mb-3">
                  <div className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                    {t('lifecycle.eyebrow')}
                  </div>
                  <h3 className="text-foreground mt-1 text-sm font-semibold">
                    {t('lifecycle.heading')}
                  </h3>
                </div>
                <p className="text-muted-foreground text-xs leading-5">
                  {t('lifecycle.subtitle')}
                </p>

                <div className="mt-3 grid gap-2">
                  {visibleLifecycle.confirm ? (
                    <form
                      action={`/${locale}/admin/shop/orders/${order.id}/lifecycle`}
                      method="post"
                    >
                      <input
                        type="hidden"
                        name={CSRF_FORM_FIELD}
                        value={lifecycleCsrfToken}
                      />
                      <input type="hidden" name="action" value="confirm" />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-left text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-100"
                      >
                        {t('lifecycle.confirm')}
                      </button>
                    </form>
                  ) : null}

                  {visibleLifecycle.cancel ? (
                    <form
                      action={`/${locale}/admin/shop/orders/${order.id}/lifecycle`}
                      method="post"
                    >
                      <input
                        type="hidden"
                        name={CSRF_FORM_FIELD}
                        value={lifecycleCsrfToken}
                      />
                      <input type="hidden" name="action" value="cancel" />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-left text-sm font-medium text-amber-700 transition-colors hover:bg-amber-500/10 dark:text-amber-100"
                      >
                        {t('lifecycle.cancel')}
                      </button>
                    </form>
                  ) : null}

                  {visibleLifecycle.complete ? (
                    <form
                      action={`/${locale}/admin/shop/orders/${order.id}/lifecycle`}
                      method="post"
                    >
                      <input
                        type="hidden"
                        name={CSRF_FORM_FIELD}
                        value={lifecycleCsrfToken}
                      />
                      <input type="hidden" name="action" value="complete" />
                      <button
                        type="submit"
                        className="w-full rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-left text-sm font-medium text-sky-700 transition-colors hover:bg-sky-500/10 dark:text-sky-100"
                      >
                        {t('lifecycle.complete')}
                      </button>
                    </form>
                  ) : null}
                </div>

                {lifecycleErrorKey ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-100"
                  >
                    {t(lifecycleErrorKey)}
                  </p>
                ) : null}
              </section>
            ) : null}

            {showShippingActions ? (
              <section className="border-border bg-muted/10 rounded-xl border p-4">
                <div className="mb-3">
                  <div className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                    {t('shippingControls.eyebrow')}
                  </div>
                  <h3 className="text-foreground mt-1 text-sm font-semibold">
                    {t('shippingControls.heading')}
                  </h3>
                </div>
                <p className="text-muted-foreground text-xs leading-5">
                  {t('shippingControls.subtitle')}
                </p>
                <div className="mt-3">
                  <ShippingActions
                    orderId={order.id}
                    csrfToken={shippingCsrfToken}
                    shippingReady={shippingReady}
                    shippingStatus={order.shippingStatus}
                    shipmentStatus={order.shipmentStatus}
                  />
                </div>
              </section>
            ) : null}

            {showPaymentActions ? (
              <section className="border-border bg-muted/10 rounded-xl border p-4">
                <div className="mb-3">
                  <div className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                    {t('paymentControls.eyebrow')}
                  </div>
                  <h3 className="text-foreground mt-1 text-sm font-semibold">
                    {t('paymentControls.heading')}
                  </h3>
                </div>
                <p className="text-muted-foreground text-xs leading-5">
                  {t('paymentControls.subtitle')}
                </p>

                <div className="mt-3 grid gap-2">
                  {paymentEnabled.refund ? (
                    <RefundButton
                      orderId={order.id}
                      disabled={false}
                      csrfToken={refundCsrfToken}
                    />
                  ) : null}

                  {paymentEnabled.cancelPayment ? (
                    <CancelPaymentButton
                      orderId={order.id}
                      disabled={false}
                      csrfToken={cancelPaymentCsrfToken}
                    />
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="text-muted-foreground mt-4 rounded-xl border border-dashed px-4 py-5 text-sm">
            {t('actions.empty')}
          </div>
        )}
      </section>

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
                {humanizePaymentStatus(order.paymentStatus, paymentStatusT)}
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
                {humanizeShippingStatus(order.shippingStatus, t)}
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
              <dd className="text-sm">
                {humanizePaymentProvider(order.paymentProvider, t)}
              </dd>
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
                  customerSummary.accountName ||
                  customerSummary.accountEmail ? (
                    <div className="min-w-0">
                      <div className="font-medium">
                        {customerSummary.accountName ??
                          customerSummary.accountEmail}
                      </div>
                      {customerSummary.accountName &&
                      customerSummary.accountEmail ? (
                        <div className="text-muted-foreground text-xs break-all">
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
        className="border-border bg-background/80 mb-6 rounded-xl border shadow-sm"
        aria-labelledby="order-history-heading"
      >
        <div className="border-border border-b p-4">
          <h2
            id="order-history-heading"
            className="text-foreground text-lg font-semibold"
          >
            {t('history.heading')}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('history.subtitle')}
          </p>
        </div>

        {history.length === 0 ? (
          <div className="p-4">
            <div className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-sm">
              {t('history.empty')}
            </div>
          </div>
        ) : (
          <ol
            className="divide-border divide-y"
            aria-label={t('history.heading')}
          >
            {history.map(entry => {
              const occurredAtLabel = safeFormatDateTime(entry.occurredAt, dtf);
              const hasTransition =
                entry.fromShippingStatus || entry.toShippingStatus;

              return (
                <li key={entry.id} className="p-4">
                  <div className="flex gap-3">
                    <div
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400"
                      aria-hidden="true"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {historyActionLabel(entry.action, t)}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {occurredAtLabel}
                          </div>
                        </div>

                        <div className="min-w-0 text-right text-sm">
                          {renderHistoryActor(entry, t)}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {hasTransition ? (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-1">
                            {t('history.shippingTransition', {
                              from: humanizeShippingStatus(
                                entry.fromShippingStatus,
                                t
                              ),
                              to: humanizeShippingStatus(
                                entry.toShippingStatus,
                                t
                              ),
                            })}
                          </span>
                        ) : null}

                        {entry.fromShipmentStatus ? (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-1">
                            {t('history.shipmentState', {
                              status: humanizeShipmentStatus(
                                entry.fromShipmentStatus,
                                t
                              ),
                            })}
                          </span>
                        ) : null}

                        {entry.requestId ? (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-1 break-all">
                            {t('history.requestId', {
                              requestId: entry.requestId,
                            })}
                          </span>
                        ) : null}

                        {entry.source === 'legacy' ? (
                          <span className="border-border text-muted-foreground rounded-full border px-2 py-1">
                            {t('history.legacySource')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

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
