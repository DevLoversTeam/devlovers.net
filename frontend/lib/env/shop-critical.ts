import 'server-only';

import { resolveShopBaseUrl } from '@/lib/shop/url';

import { getMonobankEnv } from './monobank';
import { getNovaPoshtaConfig } from './nova-poshta';
import { readServerEnv } from './server-env';
import { getStripeEnv } from './stripe';

function nonEmpty(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isFlagEnabled(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function requireEnv(name: string, message?: string): string {
  const value = nonEmpty(readServerEnv(name));
  if (!value) {
    throw new Error(message ?? `Missing env var: ${name}`);
  }
  return value;
}

export function assertCriticalShopEnv(): void {
  const appEnv = nonEmpty(readServerEnv('APP_ENV'))?.toLowerCase() ?? null;
  const databaseUrl = nonEmpty(readServerEnv('DATABASE_URL'));
  const databaseUrlLocal = nonEmpty(readServerEnv('DATABASE_URL_LOCAL'));

  if (appEnv === 'local') {
    if (!databaseUrlLocal) {
      throw new Error('[env] APP_ENV=local requires DATABASE_URL_LOCAL.');
    }
  } else if (!databaseUrl) {
    throw new Error('[env] DATABASE_URL is required outside local APP_ENV.');
  }

  requireEnv('AUTH_SECRET', 'AUTH_SECRET is not defined');

  const statusSecret = requireEnv(
    'SHOP_STATUS_TOKEN_SECRET',
    'SHOP_STATUS_TOKEN_SECRET is not configured'
  );
  if (statusSecret.length < 32) {
    throw new Error('SHOP_STATUS_TOKEN_SECRET must be at least 32 characters.');
  }

  const paymentsEnabled = isFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  if (paymentsEnabled) {
    const stripeFlag = nonEmpty(readServerEnv('STRIPE_PAYMENTS_ENABLED'));
    const stripeEnabled = stripeFlag !== 'false';

    if (stripeEnabled) {
      requireEnv(
        'STRIPE_SECRET_KEY',
        '[env] PAYMENTS_ENABLED requires STRIPE_SECRET_KEY for the Stripe rail.'
      );
      requireEnv(
        'STRIPE_WEBHOOK_SECRET',
        '[env] PAYMENTS_ENABLED requires STRIPE_WEBHOOK_SECRET for the Stripe rail.'
      );
      getStripeEnv();
    }

    const monobankToken = nonEmpty(readServerEnv('MONO_MERCHANT_TOKEN'));
    const monobankRequested =
      stripeFlag === 'false' ||
      !!monobankToken ||
      isFlagEnabled(readServerEnv('MONO_REFUND_ENABLED')) ||
      isFlagEnabled(readServerEnv('SHOP_MONOBANK_GPAY_ENABLED'));

    if (monobankRequested) {
      if (!monobankToken) {
        throw new Error(
          '[env] PAYMENTS_ENABLED requires MONO_MERCHANT_TOKEN when the Stripe rail is disabled or Monobank features are enabled.'
        );
      }

      resolveShopBaseUrl();
      getMonobankEnv();
    }
  }

  const shippingEnabled =
    isFlagEnabled(readServerEnv('SHOP_SHIPPING_ENABLED')) &&
    isFlagEnabled(readServerEnv('SHOP_SHIPPING_NP_ENABLED'));

  if (shippingEnabled) {
    getNovaPoshtaConfig();
  }
}
