import { getClientEnv, getRuntimeEnv } from '@/lib/env';

export type StripeEnv = {
  secretKey: string | null;
  webhookSecret: string | null;
  publishableKey: string | null;
  paymentsEnabled: boolean;
  mode: 'test' | 'live';
};

function nonEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function getStripeEnv(): StripeEnv {
  const runtimeEnv = getRuntimeEnv();
  const clientEnv = getClientEnv();

  const paymentsFlag = process.env.STRIPE_PAYMENTS_ENABLED ?? 'false';

  const secretKey = nonEmpty(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = nonEmpty(process.env.STRIPE_WEBHOOK_SECRET);
  const publishableKey = nonEmpty(
    clientEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? undefined
  );

  const mode =
    (nonEmpty(process.env.STRIPE_MODE) as 'test' | 'live' | null) ??
    (runtimeEnv.NODE_ENV === 'production' ? 'live' : 'test');

  const paymentsEnabled =
    String(paymentsFlag).trim() === 'true' && !!secretKey && !!webhookSecret;

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

export function isPaymentsEnabled(): boolean {
  return getStripeEnv().paymentsEnabled;
}
