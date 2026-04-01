import 'server-only';

import { isMonobankEnabled } from '@/lib/env/monobank';
import { readServerEnv } from '@/lib/env/server-env';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

export type StandardStorefrontProviderCapabilities = {
  stripeCheckoutEnabled: boolean;
  monobankCheckoutEnabled: boolean;
  monobankGooglePayEnabled: boolean;
  enabledProviders: ReadonlyArray<'monobank' | 'stripe'>;
};

function isFlagEnabled(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

export function resolveStandardStorefrontProviderCapabilities(): StandardStorefrontProviderCapabilities {
  let stripeCheckoutEnabled = false;
  try {
    stripeCheckoutEnabled = isStripePaymentsEnabled({
      requirePublishableKey: true,
    });
  } catch {
    stripeCheckoutEnabled = false;
  }

  const paymentsEnabled = isFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));

  let monobankCheckoutEnabled = false;
  if (paymentsEnabled) {
    try {
      monobankCheckoutEnabled = isMonobankEnabled();
    } catch {
      monobankCheckoutEnabled = false;
    }
  }

  const rawMonobankGooglePay = (
    readServerEnv('SHOP_MONOBANK_GPAY_ENABLED') ?? ''
  )
    .trim()
    .toLowerCase();
  const monobankGooglePayEnabled =
    monobankCheckoutEnabled &&
    (rawMonobankGooglePay === 'true' ||
      rawMonobankGooglePay === '1' ||
      rawMonobankGooglePay === 'yes' ||
      rawMonobankGooglePay === 'on');

  const enabledProviders: Array<'monobank' | 'stripe'> = [];
  if (monobankCheckoutEnabled) enabledProviders.push('monobank');
  if (stripeCheckoutEnabled) enabledProviders.push('stripe');

  return {
    stripeCheckoutEnabled,
    monobankCheckoutEnabled,
    monobankGooglePayEnabled,
    enabledProviders,
  };
}
