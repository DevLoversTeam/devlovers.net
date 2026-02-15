import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ClearCartOnMount } from '@/components/shop/ClearCartOnMount';
import { Link } from '@/i18n/routing';
import { OrderNotFoundError } from '@/lib/services/errors';
import { getOrderSummary } from '@/lib/services/orders';
import { formatMoney } from '@/lib/shop/currency';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';
import { orderIdParamSchema } from '@/lib/validation/shop';

import MonobankRedirectStatus from './MonobankRedirectStatus';
import OrderStatusAutoRefresh from './OrderStatusAutoRefresh';

export const metadata: Metadata = {
  title: 'Order Confirmed| DevLovers',
  description:
    'Your order has been placed. You can track its status on the order page.',
};

export const dynamic = 'force-dynamic';

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

function parseStatusToken(params: SearchParams): string | null {
  const raw = getStringParam(params, 'statusToken').trim();
  return raw.length ? raw : null;
}

function isMonobankRedirectFlow(
  params: SearchParams,
  statusToken: string | null
): boolean {
  if (statusToken) return true;
  const flow = getStringParam(params, 'flow').trim().toLowerCase();
  return flow === 'monobank';
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

  const statusToken = parseStatusToken(resolvedParams);
  if (isMonobankRedirectFlow(resolvedParams, statusToken)) {
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

      <section className="border-border bg-card rounded-lg border p-8">
        <p className="text-accent text-sm font-semibold tracking-wide uppercase">
          {t('success.title')}
        </p>

        <h1
          id="order-title"
          className="text-foreground mt-2 text-3xl font-bold"
        >
          {t('success.orderLabel')} #{order.id.slice(0, 8)}
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
              {t('success.orderSummary')}
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
                <dt className="text-muted-foreground">{t('success.items')}</dt>
                <dd className="text-foreground font-medium">{itemsCount}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">{t('success.status')}</dt>
                <dd className="text-foreground font-semibold capitalize">
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
