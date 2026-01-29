import { getRuntimeEnv } from '@/lib/env';

export type MonobankEnv = {
  token: string | null;
  apiBaseUrl: string;
  paymentsEnabled: boolean;
  invoiceTimeoutMs: number;
  publicKey: string | null;
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

export function getMonobankEnv(): MonobankEnv {
  const runtimeEnv = getRuntimeEnv();

  const token = nonEmpty(process.env.MONOBANK_ACQUIRING_TOKEN);
  const publicKey = nonEmpty(process.env.MONOBANK_ACQUIRING_PUBLIC_KEY);

  const apiBaseUrl =
    nonEmpty(process.env.MONOBANK_ACQUIRING_API_BASE) ??
    'https://api.monobank.ua';

  const paymentsFlag = process.env.PAYMENTS_ENABLED ?? 'false';
  const paymentsEnabled = paymentsFlag === 'true' && !!token;

  const invoiceTimeoutMs = parseTimeoutMs(
    process.env.MONOBANK_INVOICE_TIMEOUT_MS,
    runtimeEnv.NODE_ENV === 'production' ? 8000 : 12000
  );

  if (!paymentsEnabled) {
    return {
      token: null,
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
  return getMonobankEnv().paymentsEnabled;
}
