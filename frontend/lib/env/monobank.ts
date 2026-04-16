import 'server-only';

import {
  assertProductionLikeProviderString,
  assertProductionLikeProviderUrl,
} from '@/lib/env/provider-runtime';
import { readServerEnv } from '@/lib/env/server-env';

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
  const rawMode = readServerEnv('MONO_WEBHOOK_MODE');

  return {
    webhookMode: parseWebhookMode(rawMode),
    refundEnabled: readServerEnv('MONO_REFUND_ENABLED') === 'true',
    invoiceValiditySeconds: parsePositiveInt(
      readServerEnv('MONO_INVOICE_VALIDITY_SECONDS'),
      86400
    ),
    timeSkewToleranceSec: parsePositiveInt(
      readServerEnv('MONO_TIME_SKEW_TOLERANCE_SEC'),
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
  return nonEmpty(readServerEnv('MONO_MERCHANT_TOKEN'));
}

function assertMonobankRuntimeConfig(args: {
  token: string;
  apiBaseUrl: string;
  publicKey: string | null;
}) {
  assertProductionLikeProviderString({
    provider: 'monobank',
    envName: 'MONO_MERCHANT_TOKEN',
    value: args.token,
    minLength: 8,
  });
  assertProductionLikeProviderUrl({
    provider: 'monobank',
    envName: 'MONO_API_BASE',
    value: args.apiBaseUrl,
  });

  if (args.publicKey) {
    assertProductionLikeProviderString({
      provider: 'monobank',
      envName: 'MONO_PUBLIC_KEY',
      value: args.publicKey,
      minLength: 8,
    });
  }
}

function resolveBaseUrlSource(): MonobankConfig['baseUrlSource'] {
  if (nonEmpty(readServerEnv('SHOP_BASE_URL'))) return 'shop_base_url';
  if (nonEmpty(readServerEnv('APP_ORIGIN'))) return 'app_origin';
  if (nonEmpty(readServerEnv('NEXT_PUBLIC_SITE_URL')))
    return 'next_public_site_url';
  return 'unknown';
}

export function requireMonobankToken(): string {
  const token = resolveMonobankToken();
  if (!token) {
    throw new Error('MONO_MERCHANT_TOKEN is required for Monobank operations.');
  }
  assertMonobankRuntimeConfig({
    token,
    apiBaseUrl:
      nonEmpty(readServerEnv('MONO_API_BASE')) ?? 'https://api.monobank.ua',
    publicKey: nonEmpty(readServerEnv('MONO_PUBLIC_KEY')),
  });
  return token;
}

export function getMonobankEnv(): MonobankEnv {
  const nodeEnv = readServerEnv('NODE_ENV') ?? process.env.NODE_ENV;

  const token = resolveMonobankToken();
  const publicKey = nonEmpty(readServerEnv('MONO_PUBLIC_KEY'));

  const apiBaseUrl =
    nonEmpty(readServerEnv('MONO_API_BASE')) ?? 'https://api.monobank.ua';

  const paymentsFlag = readServerEnv('PAYMENTS_ENABLED') ?? 'false';
  const configured = !!token;
  const paymentsEnabled = String(paymentsFlag).trim() === 'true' && configured;

  const invoiceTimeoutMs = parseTimeoutMs(
    readServerEnv('MONO_INVOICE_TIMEOUT_MS'),
    String(nodeEnv).trim().toLowerCase() === 'production' ? 8000 : 12000
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

  assertMonobankRuntimeConfig({
    token,
    apiBaseUrl,
    publicKey,
  });

  return {
    token,
    apiBaseUrl,
    paymentsEnabled: true,
    invoiceTimeoutMs,
    publicKey,
  };
}

export function isMonobankEnabled(): boolean {
  const token = resolveMonobankToken();
  if (!token) return false;

  assertMonobankRuntimeConfig({
    token,
    apiBaseUrl:
      nonEmpty(readServerEnv('MONO_API_BASE')) ?? 'https://api.monobank.ua',
    publicKey: nonEmpty(readServerEnv('MONO_PUBLIC_KEY')),
  });

  return true;
}
