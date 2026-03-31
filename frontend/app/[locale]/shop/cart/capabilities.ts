import { isMonobankEnabled } from '@/lib/env/monobank';
import { readServerEnv } from '@/lib/env/server-env';
import { isPaymentsEnabled as isStripePaymentsEnabled } from '@/lib/env/stripe';

function isFlagEnabled(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

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
  const paymentsEnabled = isFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  if (!paymentsEnabled) return false;

  try {
    return isMonobankEnabled();
  } catch {
    return false;
  }
}

export function resolveMonobankGooglePayEnabled(): boolean {
  if (!resolveMonobankCheckoutEnabled()) return false;

  const raw = (readServerEnv('SHOP_MONOBANK_GPAY_ENABLED') ?? '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}
