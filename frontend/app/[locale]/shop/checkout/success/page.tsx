import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

import OrderStatusAutoRefresh from './OrderStatusAutoRefresh';
import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { formatMoney } from '@/lib/shop/currency';
import { getOrderSummary } from '@/lib/services/orders';
import { OrderNotFoundError } from '@/lib/services/errors';
import { orderIdParamSchema } from '@/lib/validation/shop';
import { cn } from '@/lib/utils';

import {
  SHOP_FOCUS,
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_INSET,
  SHOP_CTA_WAVE,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Order Confirmed| DevLovers',
  description:
    'Your order has been placed. You can track its status on the order page.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(params: SearchParams, key: string): string {
  const raw = params[key];
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

function parseOrderId(params: SearchParams): string | null {
  const raw = getStringParam(params, 'orderId');
  const parsed = orderIdParamSchema.safeParse({ id: raw });
  if (!parsed.success) return null;
  return parsed.data.id;
}

function isPaymentsDisabled(params: SearchParams): boolean {
  const raw = getStringParam(params, 'paymentsDisabled');
  if (!raw) return false;
  return raw === 'true' || raw === '1';
}

function shouldClearCart(params: SearchParams): boolean {
  const raw = getStringParam(params, 'clearCart');
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

function HeroCtaInner({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span
        className="absolute inset-0"
        style={shopCtaGradient(
          '--shop-hero-btn-bg',
          '--shop-hero-btn-bg-hover'
        )}
        aria-hidden="true"
      />
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
    </>
  );
}

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
      <section className="rounded-lg border border-border bg-card p-8 text-center">
        <h1 id="checkout-title" className="text-2xl font-bold text-foreground">
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

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const resolvedParams = await searchParams;
  const clearCart = shouldClearCart(resolvedParams);
  const t = await getTranslations('shop.checkout');

  const orderId = parseOrderId(resolvedParams);
  if (!orderId) {
    return (
      <CheckoutShell
        title={t('errors.missingOrderId')}
        description={t('missingOrder.message')}
      >
        <nav className="mt-6 flex justify-center gap-3" aria-label="Next steps">
          <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
            <HeroCtaInner>{t('actions.backToProducts')}</HeroCtaInner>
          </Link>

          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('actions.goToCart')}
          </Link>
        </nav>
      </CheckoutShell>
    );
  }

  const paymentsDisabled = isPaymentsDisabled(resolvedParams);

  let order: Awaited<ReturnType<typeof getOrderSummary>>;
  try {
    order = await getOrderSummary(orderId);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      return (
        <CheckoutShell
          title={t('errors.orderNotFound')}
          description={t('notFoundOrder.message')}
        >
          <nav
            className="mt-6 flex justify-center gap-3"
            aria-label="Next steps"
          >
            <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
              <HeroCtaInner>{t('actions.backToProducts')}</HeroCtaInner>
            </Link>

            <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
              {t('actions.goToCart')}
            </Link>
          </nav>
        </CheckoutShell>
      );
    }

    return (
      <CheckoutShell
        title={t('errors.unableToLoad')}
        description={t('errors.tryAgainLater')}
      />
    );
  }

  const totalMinor = order.totalAmountMinor;
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="order-title"
    >
      <ClearCartOnMount enabled={clearCart} />

      <OrderStatusAutoRefresh paymentStatus={order.paymentStatus} />

      <section className="rounded-lg border border-border bg-card p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          {t('success.title')}
        </p>

        <h1
          id="order-title"
          className="mt-2 text-3xl font-bold text-foreground"
        >
          {t('success.orderLabel')} #{order.id.slice(0, 8)}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
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
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('success.orderSummary')}
            </h2>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {t('success.totalAmount')}
                </dt>
                <dd className="font-semibold text-foreground">
                  {formatMoney(totalMinor, order.currency, locale)}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t('success.items')}</dt>
                <dd className="font-medium text-foreground">{itemsCount}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t('success.status')}</dt>
                <dd className="font-semibold capitalize text-foreground">
                  {order.paymentStatus}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <nav className="mt-8 flex flex-wrap gap-3" aria-label="Next steps">
          <Link href="/shop/products" className={SHOP_HERO_CTA_SM}>
            <HeroCtaInner>{t('success.continueShopping')}</HeroCtaInner>
          </Link>

          <Link href="/shop/cart" className={SHOP_OUTLINE_BTN}>
            {t('success.viewCart')}
          </Link>
        </nav>
      </section>
    </main>
  );
}
