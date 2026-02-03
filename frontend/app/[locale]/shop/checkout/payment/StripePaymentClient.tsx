'use client';

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import {
  loadStripe,
  type Stripe,
  type StripeElementsOptions,
} from '@stripe/stripe-js';
import { useMemo, useState } from 'react';

import { Link, useRouter } from '@/i18n/routing';
import { logError } from '@/lib/logging';
import {
  type CurrencyCode,
  currencyValues,
  formatMoney,
  resolveCurrencyFromLocale,
} from '@/lib/shop/currency';
import {
  SHOP_CTA_BASE,
  SHOP_CTA_INSET,
  SHOP_CTA_INTERACTIVE,
  SHOP_CTA_WAVE,
  SHOP_DISABLED,
  SHOP_FOCUS,
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  shopCtaGradient,
} from '@/lib/shop/ui-classes';
import { cn } from '@/lib/utils';

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
  inAppPath: string;
}): string {
  const loc = normalizeLocale(params.locale);
  const p = params.inAppPath.startsWith('/')
    ? params.inAppPath
    : `/${params.inAppPath}`;
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

const SHOP_HERO_CTA = cn(
  SHOP_CTA_BASE,
  SHOP_CTA_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'w-full items-center justify-center gap-2',
  'px-6 py-3 text-sm text-white',
  'shadow-[var(--shop-hero-btn-shadow)] hover:shadow-[var(--shop-hero-btn-shadow-hover)]'
);

const SHOP_OUTLINE = cn(
  SHOP_OUTLINE_BTN_BASE,
  SHOP_OUTLINE_BTN_INTERACTIVE,
  SHOP_FOCUS,
  SHOP_DISABLED,
  'px-5 py-2.5'
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
        className={SHOP_HERO_CTA}
        aria-disabled={!stripe || submitting}
      >
        <HeroCtaInner>
          {submitting ? 'Processing...' : 'Submit payment'}
        </HeroCtaInner>
      </button>

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
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
        className="text-muted-foreground space-y-3 text-sm"
        aria-label="Payments disabled"
      >
        <p>Payments are disabled in this environment.</p>

        <nav
          className="flex flex-col gap-3 sm:flex-row"
          aria-label="Next steps"
        >
          <Link
            href={buildInAppPath(
              `/checkout/success?orderId=${encodeURIComponent(orderId)}`
            )}
            className={cn(SHOP_HERO_CTA, 'w-full sm:w-auto')}
          >
            <HeroCtaInner>Continue</HeroCtaInner>
          </Link>

          <Link
            href={buildInAppPath('/cart')}
            className={cn(SHOP_OUTLINE, 'w-full sm:w-auto')}
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
        className="text-muted-foreground space-y-3 text-sm"
        aria-label="Payment initialization failed"
      >
        <p>Payment cannot be initialized. Please try again later.</p>

        <Link
          href={buildInAppPath('/cart')}
          className={cn(SHOP_OUTLINE, 'w-full sm:w-auto')}
        >
          Return to cart
        </Link>
      </section>
    );
  }

  if (!stripePromise || !options) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Preparing secure payment…
      </p>
    );
  }

  return (
    <section aria-label="Secure payment">
      <Elements stripe={stripePromise as Promise<Stripe>} options={options}>
        <div className="space-y-4">
          <div className="border-border bg-muted/40 text-foreground rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Pay</span>
              <span className="text-base font-semibold">
                {formatMoney(amountMinor, uiCurrency, locale)}
              </span>
            </div>

            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              {uiCurrency}
            </p>
          </div>

          <StripePaymentForm orderId={orderId} locale={locale} />
        </div>
      </Elements>
    </section>
  );
}
