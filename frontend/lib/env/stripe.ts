import {
  assertProductionLikeProviderString,
  isProductionLikeRuntime,
  ShopProviderConfigError,
} from '@/lib/env/provider-runtime';
import { readServerEnv } from '@/lib/env/server-env';

export type StripeEnv = {
  secretKey: string | null;
  webhookSecret: string | null;
  publishableKey: string | null;
  paymentsEnabled: boolean;
  mode: 'test' | 'live';
};

type StripePaymentsEnabledOptions = {
  requirePublishableKey?: boolean;
  ignoreStripePaymentsFlag?: boolean;
};

function nonEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function getStripeEnv(): StripeEnv {
  const nodeEnv = readServerEnv('NODE_ENV') ?? process.env.NODE_ENV;
  const paymentsFlag = readServerEnv('PAYMENTS_ENABLED') ?? 'false';
  const secretKey = nonEmpty(readServerEnv('STRIPE_SECRET_KEY'));
  const webhookSecret = nonEmpty(readServerEnv('STRIPE_WEBHOOK_SECRET'));
  const publishableKey = nonEmpty(
    readServerEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY')
  );

  const mode =
    (nonEmpty(readServerEnv('STRIPE_MODE')) as 'test' | 'live' | null) ??
    (String(nodeEnv).trim().toLowerCase() === 'production' ? 'live' : 'test');

  const paymentsEnabled =
    paymentsFlag === 'true' && !!secretKey && !!webhookSecret;

  if (!paymentsEnabled) {
    return {
      secretKey: null,
      webhookSecret: null,
      publishableKey: null,
      paymentsEnabled: false,
      mode,
    };
  }

  if (isProductionLikeRuntime() && mode !== 'live') {
    throw new ShopProviderConfigError({
      provider: 'stripe',
      envName: 'STRIPE_MODE',
      message:
        'stripe provider config is invalid for production runtime: STRIPE_MODE must be live.',
    });
  }

  assertProductionLikeProviderString({
    provider: 'stripe',
    envName: 'STRIPE_SECRET_KEY',
    value: secretKey,
    minLength: 16,
    requiredPrefix: 'sk_live_',
  });
  assertProductionLikeProviderString({
    provider: 'stripe',
    envName: 'STRIPE_WEBHOOK_SECRET',
    value: webhookSecret,
    minLength: 16,
    requiredPrefix: 'whsec_',
  });

  if (publishableKey) {
    assertProductionLikeProviderString({
      provider: 'stripe',
      envName: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      value: publishableKey,
      minLength: 16,
      requiredPrefix: 'pk_live_',
    });
  }

  return {
    secretKey,
    webhookSecret,
    publishableKey,
    paymentsEnabled: true,
    mode,
  };
}

function isFlagEnabled(value: string | undefined): boolean {
  return (value ?? '').trim() === 'true';
}

function isStripeRailEnabledByFlags(): boolean {
  const paymentsEnabled = isFlagEnabled(readServerEnv('PAYMENTS_ENABLED'));
  if (!paymentsEnabled) return false;

  const stripeFlag = (readServerEnv('STRIPE_PAYMENTS_ENABLED') ?? '').trim();
  return stripeFlag.length > 0 ? stripeFlag === 'true' : true;
}

export function isRawPaymentsEnabled(
  options: Pick<StripePaymentsEnabledOptions, 'requirePublishableKey'> = {}
): boolean {
  let env: StripeEnv;
  try {
    env = getStripeEnv();
  } catch (error) {
    if (error instanceof ShopProviderConfigError) return false;
    throw error;
  }
  if (!env.paymentsEnabled) return false;

  if (options.requirePublishableKey && !env.publishableKey) {
    return false;
  }

  return true;
}

export function isPaymentsEnabled(
  options: StripePaymentsEnabledOptions = {}
): boolean {
  let env: StripeEnv;
  try {
    env = getStripeEnv();
  } catch (error) {
    if (error instanceof ShopProviderConfigError) return false;
    throw error;
  }
  if (!env.paymentsEnabled) return false;

  if (!options.ignoreStripePaymentsFlag && !isStripeRailEnabledByFlags()) {
    return false;
  }

  if (options.requirePublishableKey && !env.publishableKey) {
    return false;
  }

  return true;
}
