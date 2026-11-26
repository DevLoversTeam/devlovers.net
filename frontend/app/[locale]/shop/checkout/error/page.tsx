import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ShopCtaContent } from '@/components/shop/ShopCtaContent';
import { getLocalizedMetadata } from '@/i18n/metadata';
import { Link } from '@/i18n/routing';
import { OrderNotFoundError } from '@/lib/services/errors';
import { getOrderSummary } from '@/lib/services/orders';
import { resolveCheckoutDisplayCurrency } from '@/lib/shop/checkout-display-currency';
import {
  type CheckoutSearchParams,
  getCheckoutSearchParam,
  parseCheckoutOrderId,
  parseStatusToken,
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
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return getLocalizedMetadata('shop.checkout.errorPage', locale);
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isPromise<T>(value: unknown): value is Promise<T> {
  return !!value && typeof (value as any).then === 'function';
}

const SHOP_HERO_CTA_SM = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'px-4 py-2 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE_BTN = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED
);

export default async function CheckoutErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<CheckoutSearchParams> | CheckoutSearchParams;
}) {
  const { locale } = await params;
  const t = await getTranslations('shop.checkout');
  const tShop = await getTranslations('shop');

  const resolvedSearchParams = isPromise<CheckoutSearchParams>(searchParams)
    ? await searchParams
    : searchParams;

  const orderId = parseCheckoutOrderId(
    getCheckoutSearchParam(resolvedSearchParams, 'orderId')
  );
  const statusToken = parseStatusToken(resolvedSearchParams);

  if (!orderId) {
    return (
      <main
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="checkout-error-title"
      >
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1
            id="checkout-error-title"
            className="text-foreground text-2xl font-bold"
          >
            {t('errors.missingOrderId')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('errors.missingOrderIdDescription')}
          </p>

          <nav
            className="mt-6 flex flex-wrap justify-center gap-3"
            aria-label={t('errorPage.checkoutNavigation')}
          >
            <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
              {t('actions.backToCart')}
            </Link>

            <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
              <ShopCtaContent>
                {t('actions.continueShopping')}
              </ShopCtaContent>
            </Link>
          </nav>
        </section>
      </main>
    );
  }

  let order: Awaited<ReturnType<typeof getOrderSummary>>;

  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <main
          className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
          aria-labelledby="checkout-error-title"
        >
          <section className="border-border bg-card rounded-lg border p-8 text-center">
            <h1
              id="checkout-error-title"
              className="text-foreground text-2xl font-bold"
            >
              {t('errors.orderNotFound')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('errors.orderNotFoundDescription')}
            </p>

            <nav
              className="mt-6 flex flex-wrap justify-center gap-3"
              aria-label={t('errorPage.checkoutNavigation')}
            >
              <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
                {t('actions.backToCart')}
              </Link>

              <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
                <ShopCtaContent>
                  {t('actions.continueShopping')}
                </ShopCtaContent>
              </Link>
            </nav>
          </section>
        </main>
      );
    }

    return (
      <main
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="checkout-error-title"
      >
        <section className="border-border bg-card rounded-lg border p-8 text-center">
          <h1
            id="checkout-error-title"
            className="text-foreground text-2xl font-bold"
          >
            {t('errors.unableToLoad')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {t('errors.tryAgainLater')}
          </p>
        </section>
      </main>
    );
  }

  const isFailed = order.paymentStatus === 'failed';

  const totalMinor =
    typeof order.totalAmountMinor === 'number' ? order.totalAmountMinor : null;

  const currency = resolveCheckoutDisplayCurrency(order.currency);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="checkout-error-title"
    >
      <section className="border-border bg-card rounded-lg border p-8 shadow-sm">
        <header>
          <h1
            id="checkout-error-title"
            className="text-foreground text-3xl font-bold"
          >
            {isFailed ? t('error.paymentFailed') : t('error.paymentUnclear')}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {isFailed
              ? t('error.paymentFailedDescription')
              : t('error.paymentUnclearDescription')}
          </p>
        </header>

        <section
          className="border-border bg-muted/30 text-foreground mt-6 rounded-md border p-4 text-sm"
          aria-label={tShop('orders.orderDetails')}
        >
          <dl className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{tShop('orders.orderLabel')}</dt>
              <dd className="text-muted-foreground font-mono text-xs">
                {order.id}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{tShop('total')}</dt>
              <dd className="text-foreground font-semibold">
                {totalMinor == null
                  ? '-'
                  : formatMoney(totalMinor, currency, locale)}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">
                {t('paymentStatusLabel')}
              </dt>
              <dd className="text-foreground font-semibold capitalize">
                {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </section>

        <nav
          className="mt-6 flex flex-wrap gap-3"
          aria-label={t('errorPage.nextSteps')}
        >
          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.backToCart')}
          </Link>

          {isFailed && order.id ? (
            <Link
              href={`/shop/checkout/payment/${order.id}${
                statusToken
                  ? `?statusToken=${encodeURIComponent(statusToken)}`
                  : ''
              }`}
              className={SHOP_HERO_CTA_SM}
            >
              <ShopCtaContent>{t('error.retryPayment')}</ShopCtaContent>
            </Link>
          ) : null}

          <Link href="/shop/products" className={SHOP_OUTLINE_BTN}>
            {t('actions.continueShopping')}
          </Link>
        </nav>
      </section>
    </main>
  );
}
