// frontend/app/[locale]/shop/checkout/error/page.tsx
import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';

import { formatMoney, resolveCurrencyFromLocale } from '@/lib/shop/currency';
import { OrderNotFoundError } from '@/lib/services/errors';
import { getOrderSummary } from '@/lib/services/orders';
import { orderIdParamSchema } from '@/lib/validation/shop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function getStringParam(params: SearchParams | undefined, key: string): string {
  if (!params) return '';
  const raw = params[key];
  if (!raw) return '';
  if (Array.isArray(raw)) return raw[0] ?? '';
  return raw;
}

function parseOrderId(searchParams?: SearchParams): string | null {
  const raw = getStringParam(searchParams, 'orderId');
  const parsed = orderIdParamSchema.safeParse({ id: raw });
  return parsed.success ? parsed.data.id : null;
}

export default async function CheckoutErrorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { locale } = await params;
  const t = await getTranslations('shop.checkout');

  const resolvedSearchParams: SearchParams | undefined =
    searchParams && typeof (searchParams as any).then === 'function'
      ? await (searchParams as Promise<SearchParams>)
      : (searchParams as SearchParams | undefined);

  const orderId = parseOrderId(resolvedSearchParams);

  if (!orderId) {
    return (
      <main
        className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="checkout-error-title"
      >
        <section className="rounded-lg border border-border bg-card p-8 text-center">
          <h1
            id="checkout-error-title"
            className="text-2xl font-bold text-foreground"
          >
            {t('errors.missingOrderId')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('errors.missingOrderIdDescription')}
          </p>

          <nav
            className="mt-6 flex flex-wrap justify-center gap-3"
            aria-label="Checkout navigation"
          >
            <Link
              href="/shop/cart"
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
            >
              {t('actions.backToCart')}
            </Link>
            <Link
              href="/shop/products"
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              {t('actions.continueShopping')}
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
          <section className="rounded-lg border border-border bg-card p-8 text-center">
            <h1
              id="checkout-error-title"
              className="text-2xl font-bold text-foreground"
            >
              {t('errors.orderNotFound')}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('errors.orderNotFoundDescription')}
            </p>

            <nav
              className="mt-6 flex flex-wrap justify-center gap-3"
              aria-label="Checkout navigation"
            >
              <Link
                href="/shop/cart"
                className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
              >
                {t('actions.backToCart')}
              </Link>
              <Link
                href="/shop/products"
                className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
              >
                {t('actions.continueShopping')}
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
        <section className="rounded-lg border border-border bg-card p-8 text-center">
          <h1
            id="checkout-error-title"
            className="text-2xl font-bold text-foreground"
          >
            {t('errors.unableToLoad')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('errors.tryAgainLater')}
          </p>
        </section>
      </main>
    );
  }

  const isFailed = order.paymentStatus === 'failed';

  // Prefer minor units if available (new schema), fallback to legacy major if present.
  const totalMinor =
    typeof (order as any).totalAmountMinor === 'number'
      ? (order as any).totalAmountMinor
      : null;

  const currency = (order as any).currency ?? resolveCurrencyFromLocale(locale);

  return (
    <main
      className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8"
      aria-labelledby="checkout-error-title"
    >
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <header>
          <h1
            id="checkout-error-title"
            className="text-3xl font-bold text-foreground"
          >
            {isFailed ? t('error.paymentFailed') : t('error.paymentUnclear')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isFailed
              ? t('error.paymentFailedDescription')
              : t('error.paymentUnclearDescription')}
          </p>
        </header>

        <section
          className="mt-6 rounded-md border border-border bg-muted/30 p-4 text-sm text-foreground"
          aria-label="Order details"
        >
          <dl className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('error.orderLabel')}</dt>
              <dd className="font-mono text-xs text-muted-foreground">
                {order.id}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('error.totalLabel')}</dt>
              <dd className="font-semibold text-foreground">
                {totalMinor == null
                  ? '-'
                  : formatMoney(totalMinor, currency, locale)}
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{t('error.statusLabel')}</dt>
              <dd className="font-semibold capitalize text-foreground">
                {order.paymentStatus}
              </dd>
            </div>
          </dl>
        </section>

        <nav className="mt-6 flex flex-wrap gap-3" aria-label="Next steps">
          <Link
            href="/shop/cart"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            {t('actions.backToCart')}
          </Link>

          {isFailed && order.id ? (
            <Link
              href={`/shop/checkout/payment/${order.id}`}
              className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
            >
              {t('error.retryPayment')}
            </Link>
          ) : null}

          <Link
            href="/shop/products"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            {t('actions.continueShopping')}
          </Link>
        </nav>
      </section>
    </main>
  );
}
