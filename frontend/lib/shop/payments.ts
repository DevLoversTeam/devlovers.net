import type { CurrencyCode } from '@/lib/shop/currency';

export const paymentStatusValues = [
  'pending',
  'requires_payment',
  'paid',
  'failed',
  'refunded',
  'needs_review',
] as const;

export type PaymentStatus = (typeof paymentStatusValues)[number];

export const paymentProviderValues = ['stripe', 'monobank', 'none'] as const;

export type PaymentProvider = (typeof paymentProviderValues)[number];

export const paymentMethodValues = [
  'stripe_card',
  'monobank_invoice',
  'monobank_google_pay',
] as const;

export type PaymentMethod = (typeof paymentMethodValues)[number];

export function resolveDefaultMethodForProvider(
  provider: PaymentProvider,
  currency: CurrencyCode
): PaymentMethod | null {
  if (provider === 'stripe') return 'stripe_card';

  if (provider === 'monobank') {
    if (currency === 'UAH') return 'monobank_invoice';
    return null;
  }

  return null;
}

export function isMethodAllowed(args: {
  provider: PaymentProvider;
  method: PaymentMethod;
  currency: CurrencyCode;
  flags?: {
    monobankGooglePayEnabled?: boolean;
  };
}): boolean {
  if (args.method === 'stripe_card') {
    return args.provider === 'stripe';
  }

  if (args.method === 'monobank_invoice') {
    return args.provider === 'monobank' && args.currency === 'UAH';
  }

  if (args.method === 'monobank_google_pay') {
    return (
      args.provider === 'monobank' &&
      args.currency === 'UAH' &&
      args.flags?.monobankGooglePayEnabled === true
    );
  }

  return false;
}
