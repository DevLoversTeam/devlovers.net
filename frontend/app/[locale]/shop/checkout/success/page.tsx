import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { ShopCtaContent } from '@/components/shop/ShopCtaContent';
import { Link } from '@/i18n/routing';
import { getCheckoutSuccessOrderSummary } from '@/lib/services/orders';
import {
  type CheckoutSearchParams,
  getCheckoutSearchParam,
  parseCheckoutOrderId,
  parseStatusToken,
  shouldClearCart,
} from '@/lib/shop/checkout-search-params';
import { formatMoney } from '@/lib/shop/currency';
import { formatGuestShipmentStatus } from '@/lib/shop/guest-shipment-status';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

import MonobankRedirectStatus from './MonobankRedirectStatus';
import OrderStatusAutoRefresh from './OrderStatusAutoRefresh';

export const metadata: Metadata = {
  title: 'Order Confirmed| DevLovers',
  description:
    'Your order has been placed. You can track its status on the order page.',
};

export const dynamic = 'force-dynamic';

function isMonobankRedirectFlow(params: CheckoutSearchParams): boolean {
  const flow = getCheckoutSearchParam(params, 'flow').trim().toLowerCase();
  return flow === 'monobank';
}

function isPaymentsDisabled(params: CheckoutSearchParams): boolean {
  const raw = getCheckoutSearchParam(params, 'paymentsDisabled');
  if (!raw) return false;
  return raw === 'true' || raw === '1';
}

const SHOP_HERO_CTA_SM = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  'items-center justify-center overflow-hidden',
  'px-4 py-2 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS
);

function CheckoutShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="checkout-title"
    >
      <section className="border-border bg-card rounded-lg border p-8 text-center">
        <h1 id="checkout-title" className="text-foreground text-2xl font-bold">
          {title}
        </h1>

        {description ? (
          <p className="text-muted-foreground mt-2 text-sm">{description}</p>
        ) : null}

        {children}
      </section>
    </main>
  );
}

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<CheckoutSearchParams>;
}) {
  const { locale } = await params;
  const resolvedParams = await searchParams;

  const clearCart = shouldClearCart(resolvedParams);
  const t = await getTranslations('shop.checkout');
  const tShop = await getTranslations('shop');
  const tOrder = await getTranslations('shop.orders.detail');

  const orderId = parseCheckoutOrderId(
    getCheckoutSearchParam(resolvedParams, 'orderId')
  );
  if (!orderId) {
    return (
      <CheckoutShell
        title={t('errors.missingOrderId')}
        description={t('missingOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
            <ShopCtaContent>{t('actions.backToProducts')}</ShopCtaContent>
          </Link>

          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>
        </nav>
      </CheckoutShell>
    );
  }

  const statusToken = parseStatusToken(resolvedParams);
  if (isMonobankRedirectFlow(resolvedParams)) {
    return (
      <main
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="order-title"
      >
        <ClearCartOnMount enabled={clearCart} />
        <MonobankRedirectStatus
          orderId={orderId}
          locale={locale}
          initialStatusToken={statusToken}
          paymentsDisabled={isPaymentsDisabled(resolvedParams)}
        />
      </main>
    );
  }

  const paymentsDisabled = isPaymentsDisabled(resolvedParams);

  const summaryAccess = await getCheckoutSuccessOrderSummary({
    orderId,
    statusToken,
  });
  if (!summaryAccess.ok) {
    if (summaryAccess.code === 'STATUS_TOKEN_MISCONFIGURED') {
      return (
        <CheckoutShell
          title={t('errors.unableToLoad')}
          description={t('errors.tryAgainLater')}
        />
      );
    }
    return (
      <CheckoutShell
        title={t('errors.orderNotFound')}
        description={t('notFoundOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
            <ShopCtaContent>{t('actions.backToProducts')}</ShopCtaContent>
          </Link>

          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>
        </nav>
      </CheckoutShell>
    );
  }

  const order = summaryAccess.order;

  const totalMinor = order.totalAmountMinor;
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const shipmentStatusLabel = formatGuestShipmentStatus(
    order.shipmentStatus,
    tOrder
  );

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="order-title"
    >
      <ClearCartOnMount enabled={clearCart} />

      <OrderStatusAutoRefresh paymentStatus={order.paymentStatus} />

      <section className="border-border bg-card rounded-lg border p-8">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">
          {t('success.title')}
        </p>

        <h1
          id="order-title"
          className="text-foreground mt-2 text-3xl font-bold"
        >
          {tShop('orders.orderLabel')} #{order.id.slice(0, 8)}
        </h1>

        <p className="text-muted-foreground mt-2 text-sm">
          {t('success.received')}
          {order.paymentStatus === 'paid'
            ? ` ${t('success.paymentConfirmed')}`
            : ` ${t('success.paymentProcessing')}`}
        </p>

        {paymentsDisabled ? (
          <p className="mt-3 text-sm text-amber-500" role="note">
            {t('success.paymentsDisabled')}
          </p>
        ) : null}

        <section
          className="mt-6 grid gap-6 md:grid-cols-2"
          aria-label="Order summary"
        >
          <div className="border-border bg-muted/40 rounded-md border p-4">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              {tShop('orderSummary')}
            </h2>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {t('success.totalAmount')}
                </dt>
                <dd className="text-foreground font-semibold">
                  {formatMoney(totalMinor, order.currency, locale)}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{tShop('items')}</dt>
                <dd className="text-foreground font-medium">{itemsCount}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t('paymentStatusLabel')}</dt>
                <dd className="text-foreground font-semibold capitalize">
                  {order.paymentStatus}
                </dd>
              </div>

              {shipmentStatusLabel ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {tOrder('shippingStatus')}
                  </dt>
                  <dd className="text-foreground text-right font-medium">
                    {shipmentStatusLabel}
                  </dd>
                </div>
              ) : null}

              {order.trackingNumber ? (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {tOrder('trackingNumber')}
                  </dt>
                  <dd className="text-foreground text-right font-medium [overflow-wrap:anywhere] break-words">
                    {order.trackingNumber}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </section>

        <nav className="mt-8 flex flex-wrap gap-3" aria-label="Next steps">
          <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
            <ShopCtaContent>{t('actions.continueShopping')}</ShopCtaContent>
          </Link>

          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('success.viewCart')}
          </Link>
        </nav>
      </section>
    </main>
  );
}
