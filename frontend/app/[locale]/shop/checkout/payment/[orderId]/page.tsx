import { Link } from '@/i18n/routing';
import { ClearCartOnMount } from '@/components/shop/clear-cart-on-mount';
import StripePaymentClient from '../StripePaymentClient';

import { formatMoney } from '@/lib/shop/currency';
import { getOrderSummary } from '@/lib/services/orders';
import { OrderNotFoundError } from '@/lib/services/errors';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { getStripeEnv } from '@/lib/env/stripe';
import { logError } from '@/lib/logging';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

import {
  SHOP_FOCUS,
  SHOP_DISABLED,
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  shopCtaGradient,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
} from '@/lib/shop/ui-classes';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Checkout | DevLovers',
  description: 'Complete payment securely for order',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getOrderId(params: { orderId?: string }) {
  const parsed = orderIdParamSchema.safeParse({ id: params.orderId ?? '' });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function resolveClientSecret(
  searchParams?: Record<string, string | string[] | undefined>
) {
  const raw = searchParams?.clientSecret;
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

async function buildStatusMessage(status: string) {
  const t = await getTranslations('shop.checkout.payment.statusMessages');

  if (status === 'paid') return t('alreadyPaid');
  if (status === 'failed') return t('previousFailed');
  return t('completePayment');
}

function shouldClearCart(
  searchParams?: Record<string, string | string[] | undefined>
): boolean {
  const raw = searchParams?.clearCart;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === 'true' || v === '1';
}

type PaymentPageProps = {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const SHOP_HERO_CTA_SM = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'items-center justify-center gap-2',
  'px-5 py-2.5 text-xs sm:text-sm text-white',
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
      <span
        className="absolute inset-0"
        style={shopCtaGradient(
          '--shop-hero-btn-bg',
          '--shop-hero-btn-bg-hover'
        )}
        aria-hidden="true"
      />
      {/* hover wave overlay */}
      <span
        className={SHOP_CTA_WAVE}
        style={shopCtaGradient(
          '--shop-hero-btn-bg-hover',
          '--shop-hero-btn-bg'
        )}
        aria-hidden="true"
      />
      <span className={SHOP_CTA_INSET} aria-hidden="true" />

      <span className="relative z-10">{children}</span>
    </Link>
  );
}

function PageShell({
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
      aria-labelledby="payment-title"
    >
      <section className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 id="payment-title" className="text-2xl font-bold text-foreground">
          {title}
        </h1>

        {description ? (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        ) : null}

        {children}
      </section>
    </main>
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

  const t = await getTranslations('shop.checkout');

  const orderId = getOrderId(params);

  if (!orderId) {
    return (
      <PageShell
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
      </PageShell>
    );
  }

  let order: Awaited<ReturnType<typeof getOrderSummary>>;

  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <PageShell
          title={t('errors.orderNotFound')}
          description={t('notFoundOrder.message')}
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <Link href={`${shopBase}/cart`} className={SHOP_OUTLINE_BTN}>
              {t('actions.goToCart')}
            </Link>

            <HeroCtaLink href={`${shopBase}/products`}>
              {t('actions.continueShopping')}
            </HeroCtaLink>
          </nav>
        </PageShell>
      );
    }

    return (
      <PageShell
        title={t('errors.unableToLoad')}
        description={t('errors.tryAgainLater')}
      />
    );
  }

  const stripeEnv = getStripeEnv();
  const paymentsEnabled =
    stripeEnv.paymentsEnabled && Boolean(stripeEnv.publishableKey);

  let clientSecret = resolveClientSecret(searchParams);
  const publishableKey = paymentsEnabled ? stripeEnv.publishableKey : null;

  if (
    paymentsEnabled &&
    publishableKey &&
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

        <PageShell
          title={t('payment.statusMessages.alreadyPaid')}
          description={t('success.paymentConfirmed')}
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <HeroCtaLink
              href={`${shopBase}/checkout/success?orderId=${order.id}${cc}`}
            >
              {t('payment.viewConfirmation')}
            </HeroCtaLink>

            <Link href={`${shopBase}/products`} className={SHOP_OUTLINE_BTN}>
              {t('payment.continueShopping')}
            </Link>
          </nav>
        </PageShell>
      </>
    );
  }

  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="pay-order-title"
    >
      <ClearCartOnMount enabled={clearCart} />

      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          {t('payment.title')}
        </p>

        <h1 id="pay-order-title" className="text-3xl font-bold text-foreground">
          {t('payment.payForOrder', { orderId: order.id.slice(0, 8) })}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {await buildStatusMessage(order.paymentStatus)}
        </p>
      </header>

      <section
        className="grid gap-6 lg:grid-cols-[1.2fr_1fr]"
        aria-label="Payment and order summary"
      >
        <section
          className="rounded-lg border border-border bg-card p-6"
          aria-label="Payment details"
        >
          <h2 className="text-lg font-semibold text-foreground">
            {t('payment.paymentDetails')}
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {t('payment.completePayment')}
          </p>

          <div className="mt-6 rounded-md border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t('payment.amountDue')}
              </span>

              <span className="text-xl font-bold text-foreground">
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </span>
            </div>

            <p className="mt-1 text-xs text-muted-foreground uppercase tracking-wide">
              {order.currency}
            </p>
          </div>

          <div className="mt-6">
            <StripePaymentClient
              clientSecret={clientSecret}
              orderId={order.id}
              amountMinor={order.totalAmountMinor}
              currency={order.currency}
              publishableKey={publishableKey}
              paymentsEnabled={paymentsEnabled}
              locale={locale}
            />
          </div>
        </section>

        <aside
          className="rounded-lg border border-border bg-card p-6"
          aria-label="Order summary"
        >
          <h2 className="text-lg font-semibold text-foreground">
            {t('payment.orderSummary')}
          </h2>

          <dl className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <dt>{t('payment.items')}</dt>
              <dd className="font-medium text-foreground">{itemsCount}</dd>
            </div>

            <div className="flex items-center justify-between">
              <dt>{t('payment.totalAmount')}</dt>
              <dd className="font-semibold text-foreground">
                {formatMoney(order.totalAmountMinor, order.currency, locale)}
              </dd>
            </div>

            <div className="flex items-center justify-between">
              <dt>{t('payment.status')}</dt>
              <dd className="font-semibold capitalize text-foreground">
                {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
