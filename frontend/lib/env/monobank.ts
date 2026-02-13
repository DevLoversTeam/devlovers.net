import 'server-only';

import { getRuntimeEnv, getServerEnv } from '@/lib/env';

export type MonobankEnv = {
  token: string | null;
  apiBaseUrl: string;
  paymentsEnabled: boolean;
  invoiceTimeoutMs: number;
  publicKey: string | null;
};

export type MonobankWebhookMode = 'apply' | 'store' | 'drop';

function parseWebhookMode(raw: string | undefined): MonobankWebhookMode {
  const v = (raw ?? 'apply').trim().toLowerCase();
  if (v === 'apply' || v === 'store' || v === 'drop') return v;
  return 'apply';
}

export function getMonobankConfig(): MonobankConfig {
  const env = getServerEnv();

  const rawMode = process.env.MONO_WEBHOOK_MODE ?? env.MONO_WEBHOOK_MODE;

  return {
    webhookMode: parseWebhookMode(rawMode),
    refundEnabled: env.MONO_REFUND_ENABLED === 'true',
    invoiceValiditySeconds: parsePositiveInt(env.MONO_INVOICE_VALIDITY_SECONDS, 86400),
    timeSkewToleranceSec: parsePositiveInt(env.MONO_TIME_SKEW_TOLERANCE_SEC, 300),
    baseUrlSource: resolveBaseUrlSource(),
  };
}


export type MonobankConfig = {
  webhookMode: MonobankWebhookMode;
  refundEnabled: boolean;
  invoiceValiditySeconds: number;
  timeSkewToleranceSec: number;
  baseUrlSource:
    | 'shop_base_url'
    | 'app_origin'
    | 'next_public_site_url'
    | 'unknown';
};

function nonEmpty(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  const v = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const v = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return v;
}

function resolveMonobankToken(): string | null {
  const env = getServerEnv();
  return nonEmpty(env.MONO_MERCHANT_TOKEN);
}

function resolveBaseUrlSource(): MonobankConfig['baseUrlSource'] {
  const env = getServerEnv();
  if (nonEmpty(env.SHOP_BASE_URL ?? undefined)) return 'shop_base_url';
  if (nonEmpty(env.APP_ORIGIN ?? undefined)) return 'app_origin';
  if (nonEmpty(env.NEXT_PUBLIC_SITE_URL ?? undefined))
    return 'next_public_site_url';
  return 'unknown';
}

export function requireMonobankToken(): string {
  const token = resolveMonobankToken();
  if (!token) {
    throw new Error('MONO_MERCHANT_TOKEN is required for Monobank operations.');
  }
  return token;
}

export function getMonobankEnv(): MonobankEnv {
  const runtimeEnv = getRuntimeEnv();
  const env = getServerEnv();

  const token = resolveMonobankToken();
  const publicKey = nonEmpty(env.MONO_PUBLIC_KEY);

  const apiBaseUrl = nonEmpty(env.MONO_API_BASE) ?? 'https://api.monobank.ua';

  const paymentsFlag = env.PAYMENTS_ENABLED ?? 'false';
  const configured = !!token;
  const paymentsEnabled = String(paymentsFlag).trim() === 'true' && configured;

  const invoiceTimeoutMs = parseTimeoutMs(
    env.MONO_INVOICE_TIMEOUT_MS,
    runtimeEnv.NODE_ENV === 'production' ? 8000 : 12000
  );

  if (!paymentsEnabled) {
    return {
      token,
      apiBaseUrl,
      paymentsEnabled: false,
      invoiceTimeoutMs,
      publicKey,
    };
  }

  return {
    token,
    apiBaseUrl,
    paymentsEnabled: true,
    invoiceTimeoutMs,
    publicKey,
  };
}

export function isMonobankEnabled(): boolean {
  return !!resolveMonobankToken();
}
