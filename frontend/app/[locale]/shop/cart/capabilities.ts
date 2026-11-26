import { isMonobankEnabled } from '@/lib/env/monobank';
import { readServerEnv } from '@/lib/env/server-env';
import { isShopFlagEnabled } from '@/lib/env/shop-flag';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

export function resolveStripeCheckoutEnabled(): boolean {
  try {
    return isStripePaymentsEnabled({
      requirePublishableKey: true,
    });
  } catch {
    return false;
  }
}

export function resolveMonobankCheckoutEnabled(): boolean {
  const paymentsEnabled = isShopFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  if (!paymentsEnabled) return false;

  try {
    return isMonobankEnabled();
  } catch {
    return false;
  }
}

export function resolveMonobankGooglePayEnabled(): boolean {
  if (!resolveMonobankCheckoutEnabled()) return false;

  return isShopFlagEnabled(readServerEnv('SHOP_MONOBANK_GPAY_ENABLED'));
}
