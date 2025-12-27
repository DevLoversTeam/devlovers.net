"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions, type Stripe } from "@stripe/stripe-js";

import {
  currencyValues,
  formatMoney,
  resolveCurrencyFromLocale,
  type CurrencyCode,
} from "@/lib/shop/currency";

type PaymentFormProps = {
  orderId: string;
  locale: string;
};

type StripePaymentClientProps = {
  clientSecret?: string | null;
  publishableKey: string | null;
  paymentsEnabled: boolean;
  orderId: string;
  amount: number;   // minor units expected
  currency: string; // should come from server policy, but we still guard it
  locale: string;
};

function toCurrencyCode(value: string | null | undefined, locale: string): CurrencyCode {
  const normalized = (value ?? "").trim().toUpperCase();
  return currencyValues.includes(normalized as CurrencyCode)
    ? (normalized as CurrencyCode)
    : resolveCurrencyFromLocale(locale);
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
      setErrorMessage("Payment is not ready yet. Please try again in a moment.");
      return;
    }

    setSubmitting(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/${locale}/shop/checkout/success?orderId=${orderId}`,
        },
      });

      if (error) {
        setErrorMessage(error.message ?? "Unable to confirm payment.");
        router.push(`/${locale}/shop/checkout/error?orderId=${orderId}`);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        router.push(`/${locale}/shop/checkout/success?orderId=${orderId}`);
        return;
      }

      router.push(`/${locale}/shop/checkout/error?orderId=${orderId}`);
    } catch (error) {
      console.error("Payment confirmation failed", error);
      setErrorMessage("We couldn’t confirm your payment. Please try again.");
      router.push(`/${locale}/shop/checkout/error?orderId=${orderId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
      >
        {submitting ? "Processing..." : "Submit payment"}
      </button>
      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </form>
  );
}

export default function StripePaymentClient({
  clientSecret,
  publishableKey,
  paymentsEnabled,
  orderId,
  amount,
  currency,
  locale,
}: StripePaymentClientProps) {
  const uiCurrency = useMemo(() => toCurrencyCode(currency, locale), [currency, locale]);

  const stripePromise = useMemo(() => {
    if (!paymentsEnabled || !publishableKey) return null;
    return loadStripe(publishableKey);
  }, [paymentsEnabled, publishableKey]);

  const options = useMemo<StripeElementsOptions | undefined>(
    () =>
      clientSecret && paymentsEnabled
        ? { clientSecret, appearance: { theme: "stripe" } }
        : undefined,
    [clientSecret, paymentsEnabled]
  );

  if (!paymentsEnabled) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Payments are disabled in this environment.</p>
        <div className="flex gap-3">
          <Link
            href={`/${locale}/shop/checkout/success?orderId=${orderId}`}
            className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wide text-accent-foreground hover:bg-accent/90"
          >
            Continue
          </Link>
          <Link
            href={`/${locale}/shop/cart`}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
          >
            Back to cart
          </Link>
        </div>
      </div>
    );
  }

  if (!clientSecret || !clientSecret.trim()) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Payment cannot be initialized. Please try again later.</p>
        <Link
          href={`/${locale}/shop/cart`}
          className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
        >
          Return to cart
        </Link>
      </div>
    );
  }

  if (!stripePromise || !options) {
    return <p className="text-sm text-muted-foreground">Preparing secure payment…</p>;
  }

  return (
    <Elements stripe={stripePromise as Promise<Stripe>} options={options}>
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Pay</span>
            <span className="text-base font-semibold">{formatMoney(amount, uiCurrency, locale)}</span>
          </div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{uiCurrency}</p>
        </div>
        <StripePaymentForm orderId={orderId} locale={locale} />
      </div>
    </Elements>
  );
}
