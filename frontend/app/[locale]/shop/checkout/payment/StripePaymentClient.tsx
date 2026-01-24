'use client';

import { useMemo, useState } from 'react';
import { Link, useRouter } from '@/i18n/routing';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  loadStripe,
  type StripeElementsOptions,
  type Stripe,
} from '@stripe/stripe-js';

import {
  currencyValues,
  formatMoney,
  resolveCurrencyFromLocale,
  type CurrencyCode,
} from '@/lib/shop/currency';
import { logError } from '@/lib/logging';

type PaymentFormProps = {
  orderId: string;
  locale: string;
};

type StripePaymentClientProps = {
  clientSecret?: string | null;
  publishableKey: string | null;
  paymentsEnabled: boolean;
  orderId: string;
  amountMinor: number;
  currency: string;
  locale: string;
};

function toCurrencyCode(
  value: string | null | undefined,
  locale: string
): CurrencyCode {
  const normalized = (value ?? '').trim().toUpperCase();
  return currencyValues.includes(normalized as CurrencyCode)
    ? (normalized as CurrencyCode)
    : resolveCurrencyFromLocale(locale);
}

/**
 * IMPORTANT:
 * - In-app navigation uses next-intl routing -> DO NOT prefix locale manually.
 * - Stripe return_url is an external redirect -> MUST include locale exactly once.
 */
const IN_APP_SHOP_BASE = '/shop';

function normalizeLocale(raw: string): string {
  return (raw ?? '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function buildInAppPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${IN_APP_SHOP_BASE}${p}`;
}

function buildStripeReturnUrl(params: {
  locale: string;
  inAppPath: string; // must be "/shop/..."
}): string {
  const loc = normalizeLocale(params.locale);
  const p = params.inAppPath.startsWith('/')
    ? params.inAppPath
    : `/${params.inAppPath}`;
  // Note: p can contain query string; URL() supports it.
  return new URL(`/${loc}${p}`, window.location.origin).toString();
}

function nextRouteForPaymentResult(params: {
  orderId: string;
  status?: string | null;
}) {
  const { orderId, status } = params;
  const id = encodeURIComponent(orderId);

  const success = buildInAppPath(`/checkout/success?orderId=${id}`);
  const failure = buildInAppPath(`/checkout/error?orderId=${id}`);

  if (!status) return success;
  if (
    status === 'succeeded' ||
    status === 'processing' ||
    status === 'requires_capture'
  ) {
    return success;
  }
  if (status === 'requires_payment_method' || status === 'canceled') {
    return failure;
  }
  return success;
}

function StripePaymentForm({ orderId, locale }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!stripe || !elements) {
      setErrorMessage(
        'Payment is not ready yet. Please try again in a moment.'
      );
      return;
    }

    setSubmitting(true);

    try {
      const id = encodeURIComponent(orderId);

      const inAppSuccess = buildInAppPath(`/checkout/success?orderId=${id}`);
      const inAppFailure = buildInAppPath(`/checkout/error?orderId=${id}`);

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          // Stripe redirect comes from outside Next.js routing — MUST include locale exactly once.
          return_url: buildStripeReturnUrl({ locale, inAppPath: inAppSuccess }),
        },
      });

      if (error) {
        setErrorMessage(error.message ?? 'Unable to confirm payment.');
        router.push(inAppFailure);
        return;
      }

      const next = nextRouteForPaymentResult({
        orderId,
        status: paymentIntent?.status ?? null,
      });

      router.push(next);
    } catch (error) {
      logError('stripe_payment_confirm_failed', error, { orderId });
      setErrorMessage('We couldn’t confirm your payment. Please try again.');
      router.push(
        buildInAppPath(`/checkout/error?orderId=${encodeURIComponent(orderId)}`)
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      aria-label="Stripe payment form"
    >
      <PaymentElement />

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        aria-disabled={!stripe || submitting}
      >
        {submitting ? 'Processing...' : 'Submit payment'}
      </button>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}

export default function StripePaymentClient({
  clientSecret,
  publishableKey,
  paymentsEnabled,
  orderId,
  amountMinor,
  currency,
  locale,
}: StripePaymentClientProps) {
  const uiCurrency = useMemo(
    () => toCurrencyCode(currency, locale),
    [currency, locale]
  );

  const stripePromise = useMemo(() => {
    if (!paymentsEnabled || !publishableKey) return null;
    return loadStripe(publishableKey);
  }, [paymentsEnabled, publishableKey]);

  const options = useMemo<StripeElementsOptions | undefined>(
    () =>
      clientSecret && paymentsEnabled
        ? { clientSecret, appearance: { theme: 'stripe' } }
        : undefined,
    [clientSecret, paymentsEnabled]
  );

  if (!paymentsEnabled) {
    return (
      <section
        className="space-y-3 text-sm text-muted-foreground"
        aria-label="Payments disabled"
      >
        <p>Payments are disabled in this environment.</p>
        <nav className="flex gap-3" aria-label="Next steps">
          <Link
            href={buildInAppPath(
              `/checkout/success?orderId=${encodeURIComponent(orderId)}`
            )}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
          >
            Continue
          </Link>
          <Link
            href={buildInAppPath('/cart')}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Back to cart
          </Link>
        </nav>
      </section>
    );
  }

  if (!clientSecret || !clientSecret.trim()) {
    return (
      <section
        className="space-y-3 text-sm text-muted-foreground"
        aria-label="Payment initialization failed"
      >
        <p>Payment cannot be initialized. Please try again later.</p>
        <Link
          href={buildInAppPath('/cart')}
          className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
        >
          Return to cart
        </Link>
      </section>
    );
  }

  if (!stripePromise || !options) {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Preparing secure payment…
      </p>
    );
  }

  return (
    <section aria-label="Secure payment">
      <Elements stripe={stripePromise as Promise<Stripe>} options={options}>
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pay</span>
              <span className="text-base font-semibold">
                {formatMoney(amountMinor, uiCurrency, locale)}
              </span>
            </div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {uiCurrency}
            </p>
          </div>

          <StripePaymentForm orderId={orderId} locale={locale} />
        </div>
      </Elements>
    </section>
  );
}
