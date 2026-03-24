import 'server-only';

import crypto from 'node:crypto';

import type { CurrencyCode } from '@/lib/shop/currency';

import type { CheckoutDeliveryMethodCode } from './checkout-payload';

const SHIPPING_QUOTE_VERSION = 1;
export const CHECKOUT_SHIPPING_QUOTE_CURRENCY = 'UAH' as const;
export type CheckoutShippingQuoteCurrency =
  typeof CHECKOUT_SHIPPING_QUOTE_CURRENCY;

const SHIPPING_AMOUNT_ENV_BY_METHOD: Record<
  CheckoutDeliveryMethodCode,
  string
> = {
  NP_WAREHOUSE: 'SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR',
  NP_LOCKER: 'SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR',
  NP_COURIER: 'SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR',
};

export class CheckoutShippingQuoteConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutShippingQuoteConfigError';
  }
}

export type CheckoutShippingQuote = {
  methodCode: CheckoutDeliveryMethodCode;
  currency: CheckoutShippingQuoteCurrency;
  amountMinor: number;
  quoteFingerprint: string;
};

export function isCheckoutShippingQuoteCurrency(
  currency: CurrencyCode
): currency is CheckoutShippingQuoteCurrency {
  return currency === CHECKOUT_SHIPPING_QUOTE_CURRENCY;
}

function readNonNegativeIntEnv(name: string): number | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) return null;

  return parsed;
}

export function createCheckoutShippingQuoteFingerprint(args: {
  methodCode: CheckoutDeliveryMethodCode;
  currency: CheckoutShippingQuoteCurrency;
  amountMinor: number;
}): string {
  const payload = JSON.stringify({
    v: SHIPPING_QUOTE_VERSION,
    methodCode: args.methodCode,
    currency: args.currency,
    amountMinor: args.amountMinor,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function resolveCheckoutShippingQuote(args: {
  methodCode: CheckoutDeliveryMethodCode;
  currency: CheckoutShippingQuoteCurrency;
}): CheckoutShippingQuote {
  const envName = SHIPPING_AMOUNT_ENV_BY_METHOD[args.methodCode];
  const amountMinor = readNonNegativeIntEnv(envName);

  if (amountMinor === null) {
    throw new CheckoutShippingQuoteConfigError(
      `Missing or invalid ${envName} shipping amount.`
    );
  }

  return {
    methodCode: args.methodCode,
    currency: CHECKOUT_SHIPPING_QUOTE_CURRENCY,
    amountMinor,
    quoteFingerprint: createCheckoutShippingQuoteFingerprint({
      methodCode: args.methodCode,
      currency: CHECKOUT_SHIPPING_QUOTE_CURRENCY,
      amountMinor,
    }),
  };
}
