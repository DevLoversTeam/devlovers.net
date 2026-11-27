import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  CheckoutNoticePage,
  CheckoutPageShell,
} from '@/components/shop/checkout/CheckoutPageShell';
import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { ShopCtaContent } from '@/components/shop/ShopCtaContent';
import { Link } from '@/i18n/routing';
import {
  getStripeEnv,
  isPaymentsEnabled as isStripePaymentsEnabled,
} from '@/lib/env/stripe';
import { logError } from '@/lib/logging';
import { getCheckoutPaymentPageOrderSummary } from '@/lib/services/orders';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';
import {
  type CheckoutSearchParams,
  getCheckoutSearchParam,
  parseCheckoutOrderId,
  parseStatusToken,
  shouldClearCart,
} from '@/lib/shop/checkout-search-params';
import { formatMoney } from '@/lib/shop/currency';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

import StripePaymentClient from '../StripePaymentClient';

export const metadata: Metadata = {
  title: 'Checkout | DevLovers',
  description: 'Complete payment securely for order',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function buildStatusMessage(status: string) {
  const t = await getTranslations('shop.checkout.payment.statusMessages');

  if (status === 'paid') return t('alreadyPaid');
  if (status === 'failed') return t('previousFailed');
  return t('completePayment');
}

function canInitializeStripeForPaymentStatus(status: string): boolean {
  return (
    status === 'pending' || status === 'requires_payment' || status === 'failed'
  );
}

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<CheckoutSearchParams>;
};

const SHOP_HERO_CTA_SM = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'items-center justify-center gap-2',
  'px-5 py-2.5 text-xs text-white sm:text-sm',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED
);

function HeroCtaLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(SHOP_HERO_CTA_SM, className)}>
      <ShopCtaContent>{children}</ShopCtaContent>
    </Link>
  );
}

export default async function PaymentPage(props: PaymentPageProps) {
  const params = await props.params;
  const searchParams = props.searchParams
    ? await props.searchParams
    : undefined;

  const clearCart = shouldClearCart(searchParams);
  const cc = clearCart ? '&clearCart=1' : '';
  const { locale } = params;
  const shopBase = `/shop`;
  const statusToken = parseStatusToken(searchParams);
  const statusTokenQuery = statusToken
    ? `&statusToken=${encodeURIComponent(statusToken)}`
    : '';

  const t = await getTranslations('shop.checkout');
  const tShop = await getTranslations('shop');

  const orderId = parseCheckoutOrderId(params.orderId);

  if (!orderId) {
    return (
      <CheckoutNoticePage
        titleId="payment-title"
        title={t('errors.invalidOrder')}
        description={t('missingOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href={`${shopBase}/cart`} className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>

          <HeroCtaLink href={`${shopBase}/products`}>
            {t('actions.continueShopping')}
          </HeroCtaLink>
        </nav>
      </CheckoutNoticePage>
    );
  }

  const orderAccess = await getCheckoutPaymentPageOrderSummary({
    orderId,
    statusToken,
  });

  if (!orderAccess.ok) {
    if (orderAccess.code === 'STATUS_TOKEN_MISCONFIGURED') {
      return (
        <CheckoutNoticePage
          titleId="payment-title"
          title={t('errors.unableToLoad')}
          description={t('errors.tryAgainLater')}
        />
      );
    }

    return (
      <CheckoutNoticePage
        titleId="payment-title"
        title={t('errors.orderNotFound')}
        description={t('notFoundOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href={`${shopBase}/cart`} className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>

          <HeroCtaLink href={`${shopBase}/products`}>
            {t('actions.continueShopping')}
          </HeroCtaLink>
        </nav>
      </CheckoutNoticePage>
    );
  }
  const order = orderAccess.order;
  if (order.paymentProvider !== 'stripe') {
    return (
      <CheckoutNoticePage
        titleId="payment-title"
        title={t('errors.orderNotFound')}
        description={t('notFoundOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href={`${shopBase}/cart`} className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>

          <HeroCtaLink href={`${shopBase}/products`}>
            {t('actions.continueShopping')}
          </HeroCtaLink>
        </nav>
      </CheckoutNoticePage>
    );
  }

  const paymentsEnabled = isStripePaymentsEnabled({
    requirePublishableKey: true,
  });
  const stripeEnv = getStripeEnv();

  let clientSecret = getCheckoutSearchParam(searchParams, 'clientSecret');
  const publishableKey = paymentsEnabled ? stripeEnv.publishableKey : null;
  const shouldInitStripePaymentIntent = canInitializeStripeForPaymentStatus(
    order.paymentStatus
  );

  if (
    paymentsEnabled &&
    publishableKey &&
    shouldInitStripePaymentIntent &&
    (!clientSecret || !clientSecret.trim())
  ) {
    const existingPi = order.paymentIntentId?.trim() ?? '';
    let phase: 'ensureStripePaymentIntentForOrder' | 'unknown' = 'unknown';

    try {
      phase = 'ensureStripePaymentIntentForOrder';
      const ensured = await ensureStripePaymentIntentForOrder({
        orderId: order.id,
        existingPaymentIntentId: existingPi || null,
      });

      clientSecret = ensured.clientSecret;
    } catch (error) {
      logError('payment_page_failed', error, {
        orderId: order.id,
        existingPi,
        phase,
      });
    }
  }

  if (order.paymentStatus === 'paid') {
    return (
      <>
        <ClearCartOnMount enabled={clearCart} />

        <CheckoutNoticePage
          titleId="payment-title"
          title={t('payment.statusMessages.alreadyPaid')}
          description={t('success.paymentConfirmed')}
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <HeroCtaLink
              href={`${shopBase}/checkout/success?orderId=${order.id}${statusTokenQuery}${cc}`}
            >
              {t('payment.viewConfirmation')}
            </HeroCtaLink>

            <Link href={`${shopBase}/products`} className={SHOP_OUTLINE_BTN}>
              {t('actions.continueShopping')}
            </Link>
          </nav>
        </CheckoutNoticePage>
      </>
    );
  }

  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CheckoutPageShell aria-labelledby="pay-order-title">
      <ClearCartOnMount enabled={clearCart} />

      <header className="mb-6">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">
          {t('payment.title')}
        </p>

        <h1 id="pay-order-title" className="text-foreground text-3xl font-bold">
          {t('payment.payForOrder', { orderId: order.id.slice(0, 8) })}
        </h1>

        <p className="text-muted-foreground mt-2 text-sm">
          {await buildStatusMessage(order.paymentStatus)}
        </p>
      </header>

      <section
        className="grid gap-6 lg:grid-cols-[1.2fr_1fr]"
        aria-label="Payment and order summary"
      >
        <section
          className="border-border bg-card rounded-lg border p-6"
          aria-label="Payment details"
        >
          <h2 className="text-foreground text-lg font-semibold">
            {t('payment.paymentDetails')}
          </h2>

          <p className="text-muted-foreground mt-2 text-sm">
            {t('payment.completePayment')}
          </p>

          <div className="border-border bg-muted/30 mt-6 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {t('payment.amountDue')}
              </span>

              <span className="text-foreground text-xl font-bold">
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </span>
            </div>

            <p className="text-muted-foreground mt-1 text-xs tracking-wide uppercase">
              {order.currency}
            </p>
          </div>

          <div className="mt-6">
            <StripePaymentClient
              clientSecret={clientSecret}
              orderId={order.id}
              statusToken={statusToken}
              amountMinor={order.totalAmountMinor}
              currency={order.currency}
              publishableKey={publishableKey}
              paymentsEnabled={paymentsEnabled}
              locale={locale}
            />
          </div>
        </section>

        <aside
          className="border-border bg-card rounded-lg border p-6"
          aria-label="Order summary"
        >
          <h2 className="text-foreground text-lg font-semibold">
            {tShop('orderSummary')}
          </h2>

          <dl className="text-muted-foreground mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt>{tShop('items')}</dt>
              <dd
                data-testid="payment-summary-items"
                className="text-foreground font-medium"
              >
                {itemsCount}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt>{t('payment.totalAmount')}</dt>
              <dd
                data-testid="payment-summary-total"
                className="text-foreground font-semibold"
              >
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt>{t('paymentStatusLabel')}</dt>
              <dd
                data-testid="payment-summary-status"
                className="text-foreground font-semibold capitalize"
              >
                {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </CheckoutPageShell>
  );
}
