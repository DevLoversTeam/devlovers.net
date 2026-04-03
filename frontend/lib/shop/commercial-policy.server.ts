import 'server-only';

import { isMonobankEnabled } from '@/lib/env/monobank';
import { readServerEnv } from '@/lib/env/server-env';
import { assertCriticalShopEnv } from '@/lib/env/shop-critical';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

export type StandardStorefrontProviderCapabilities = {
  stripeCheckoutEnabled: boolean;
  monobankCheckoutEnabled: boolean;
  monobankGooglePayEnabled: boolean;
  enabledProviders: ReadonlyArray<'monobank' | 'stripe'>;
};

function isFlagEnabled(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function resolveStandardStorefrontProviderCapabilities(): StandardStorefrontProviderCapabilities {
  assertCriticalShopEnv();

  const stripeCheckoutEnabled = isStripePaymentsEnabled({
    requirePublishableKey: true,
  });

  const paymentsEnabled = isFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  const monobankCheckoutEnabled = paymentsEnabled ? isMonobankEnabled() : false;

  const monobankGooglePayEnabled =
    monobankCheckoutEnabled &&
    isFlagEnabled(readServerEnv('SHOP_MONOBANK_GPAY_ENABLED'));

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
