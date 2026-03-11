import { getClientEnv, getRuntimeEnv } from '@/lib/env';

export type StripeEnv = {
  secretKey: string | null;
  webhookSecret: string | null;
  publishableKey: string | null;
  paymentsEnabled: boolean;
  mode: 'test' | 'live';
};

type StripePaymentsEnabledOptions = {
  requirePublishableKey?: boolean;
  respectStripePaymentsFlag?: boolean;
};

function nonEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function getStripeEnv(): StripeEnv {
  const runtimeEnv = getRuntimeEnv();
  const clientEnv = getClientEnv();

  const paymentsFlag = process.env.PAYMENTS_ENABLED ?? 'false';
  const secretKey = nonEmpty(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = nonEmpty(process.env.STRIPE_WEBHOOK_SECRET);
  const publishableKey = nonEmpty(
    clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? undefined
  );

  const mode =
    (nonEmpty(process.env.STRIPE_MODE) as 'test' | 'live' | null) ??
    (runtimeEnv.NODE_ENV === 'production' ? 'live' : 'test');

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
  const paymentsEnabled = isFlagEnabled(process.env.PAYMENTS_ENABLED);
  if (!paymentsEnabled) return false;

  const stripeFlag = (process.env.STRIPE_PAYMENTS_ENABLED ?? '').trim();
  return stripeFlag.length > 0 ? stripeFlag === 'true' : true;
}

export function isPaymentsEnabled(
  options: StripePaymentsEnabledOptions = {}
): boolean {
  const env = getStripeEnv();
  if (!env.paymentsEnabled) return false;

  if (options.respectStripePaymentsFlag && !isStripeRailEnabledByFlags()) {
    return false;
  }

  if (options.requirePublishableKey && !env.publishableKey) {
    return false;
  }

  return true;
}
