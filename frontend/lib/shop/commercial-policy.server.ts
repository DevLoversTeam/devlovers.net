import 'server-only';

import { isMonobankEnabled } from '@/lib/env/monobank';
import { readServerEnv } from '@/lib/env/server-env';
import { assertCriticalShopEnv } from '@/lib/env/shop-critical';
import { isShopFlagEnabled } from '@/lib/env/shop-flag';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

export type StandardStorefrontProviderCapabilities = {
  stripeCheckoutEnabled: boolean;
  monobankCheckoutEnabled: boolean;
  monobankGooglePayEnabled: boolean;
  enabledProviders: ReadonlyArray<'monobank' | 'stripe'>;
};

export function resolveStandardStorefrontProviderCapabilities(): StandardStorefrontProviderCapabilities {
  assertCriticalShopEnv();

  const stripeCheckoutEnabled = isStripePaymentsEnabled({
    requirePublishableKey: true,
  });

  const paymentsEnabled = isShopFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  const monobankCheckoutEnabled = paymentsEnabled ? isMonobankEnabled() : false;

  const monobankGooglePayEnabled =
    monobankCheckoutEnabled &&
    isShopFlagEnabled(readServerEnv('SHOP_MONOBANK_GPAY_ENABLED'));

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
