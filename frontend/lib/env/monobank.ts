import 'server-only';

import { getRuntimeEnv } from '@/lib/env';

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
  const rawMode = process.env.MONO_WEBHOOK_MODE;

  return {
    webhookMode: parseWebhookMode(rawMode),
    refundEnabled: process.env.MONO_REFUND_ENABLED === 'true',
    invoiceValiditySeconds: parsePositiveInt(
      process.env.MONO_INVOICE_VALIDITY_SECONDS,
      86400
    ),
    timeSkewToleranceSec: parsePositiveInt(
      process.env.MONO_TIME_SKEW_TOLERANCE_SEC,
      300
    ),
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
  return nonEmpty(process.env.MONO_MERCHANT_TOKEN);
}

function resolveBaseUrlSource(): MonobankConfig['baseUrlSource'] {
  if (nonEmpty(process.env.SHOP_BASE_URL)) return 'shop_base_url';
  if (nonEmpty(process.env.APP_ORIGIN)) return 'app_origin';
  if (nonEmpty(process.env.NEXT_PUBLIC_SITE_URL)) return 'next_public_site_url';
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

  const token = resolveMonobankToken();
  const publicKey = nonEmpty(process.env.MONO_PUBLIC_KEY);

  const apiBaseUrl =
    nonEmpty(process.env.MONO_API_BASE) ?? 'https://api.monobank.ua';

  const paymentsFlag = process.env.PAYMENTS_ENABLED ?? 'false';
  const configured = !!token;
  const paymentsEnabled = String(paymentsFlag).trim() === 'true' && configured;

  const invoiceTimeoutMs = parseTimeoutMs(
    process.env.MONO_INVOICE_TIMEOUT_MS,
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
