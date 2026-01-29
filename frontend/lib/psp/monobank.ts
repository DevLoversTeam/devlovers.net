import crypto from 'node:crypto';

import { getMonobankEnv } from '@/lib/env/monobank';
// import { MONO_CCY, SHOP_CURRENCY } from '@/lib/shop/currency';
import { logError } from '@/lib/logging';
export const MONO_CCY = 980 as const;
export const MONO_CURRENCY = 'UAH' as const;

export type MonobankPaymentType = 'debit';

export type MonobankInvoiceCreateArgs = {
  amountMinor: number;
  orderId: string;
  redirectUrl: string;
  webhookUrl: string;
  paymentType?: MonobankPaymentType;
};

export type MonobankInvoiceResponse = {
  invoiceId: string;
  pageUrl: string;
  raw: Record<string, unknown>;
};

export function buildMonobankInvoicePayload(
  args: MonobankInvoiceCreateArgs
): Record<string, unknown> {
  const paymentType = args.paymentType ?? 'debit';
  if (paymentType !== 'debit') {
    throw new Error(`Unsupported paymentType: ${paymentType}`);
  }

  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) {
    throw new Error('Invalid invoice amount (minor units)');
  }

  return {
    amount: args.amountMinor,
    ccy: MONO_CCY,
    paymentType,
    merchantPaymInfo: {
      reference: args.orderId,
      destination: `Order ${args.orderId}`,
    },
    redirectUrl: args.redirectUrl,
    webHookUrl: args.webhookUrl,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function parsePageUrl(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return null;
}

export async function createMonobankInvoice(
  args: MonobankInvoiceCreateArgs
): Promise<MonobankInvoiceResponse> {
  const env = getMonobankEnv();

  if (!env.paymentsEnabled || !env.token) {
    throw new Error('Monobank payments are disabled');
  }

  if (MONO_CURRENCY !== 'UAH') {
    throw new Error('Monobank invoice requires UAH currency');
  }

  const payload = buildMonobankInvoicePayload(args);
  const url = `${env.apiBaseUrl.replace(/\/$/, '')}/api/merchant/invoice/create`;

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Token': env.token,
      },
      body: JSON.stringify(payload),
    },
    env.invoiceTimeoutMs
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Monobank invoice create failed (${res.status}): ${text.slice(0, 120)}`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Monobank invoice create returned invalid JSON');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Monobank invoice create returned invalid payload');
  }

  const raw = data as Record<string, unknown>;
  const invoiceId = typeof raw.invoiceId === 'string' ? raw.invoiceId : '';
  const pageUrl =
    parsePageUrl(raw.pageUrl) ??
    parsePageUrl(raw.paymentUrl) ??
    parsePageUrl(raw.invoiceUrl);

  if (!invoiceId || !pageUrl) {
    throw new Error('Monobank invoice create missing invoiceId/pageUrl');
  }

  return { invoiceId, pageUrl, raw };
}

export async function cancelMonobankInvoice(invoiceId: string): Promise<void> {
  const env = getMonobankEnv();
  if (!env.paymentsEnabled || !env.token) return;

  const url = `${env.apiBaseUrl.replace(/\/$/, '')}/api/merchant/invoice/cancel`;

  try {
    await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Token': env.token,
        },
        body: JSON.stringify({ invoiceId }),
      },
      env.invoiceTimeoutMs
    );
  } catch (error) {
    logError('monobank_invoice_cancel_failed', error, { invoiceId });
  }
}

let _cachedPubKey: string | null = null;

function normalizePemPublicKey(raw: string): string {
  if (raw.includes('BEGIN PUBLIC KEY')) return raw;
  const stripped = raw.replace(/\s+/g, '');
  const chunks = stripped.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----`;
}

export async function getMonobankPublicKey(): Promise<string> {
  const env = getMonobankEnv();
  if (env.publicKey) return normalizePemPublicKey(env.publicKey);
  if (_cachedPubKey) return _cachedPubKey;

  if (!env.token || !env.paymentsEnabled) {
    throw new Error('Monobank public key unavailable');
  }

  const url = `${env.apiBaseUrl.replace(/\/$/, '')}/api/merchant/pubkey`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        'X-Token': env.token,
      },
    },
    env.invoiceTimeoutMs
  );

  if (!res.ok) {
    throw new Error(`Monobank pubkey fetch failed (${res.status})`);
  }

  const text = await res.text();
  let key = text.trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.key === 'string') {
      key = parsed.key.trim();
    }
  } catch {
    // not JSON, use raw text
  }

  if (!key) {
    throw new Error('Monobank pubkey missing in response');
  }

  _cachedPubKey = normalizePemPublicKey(key);
  return _cachedPubKey;
}

export async function verifyMonobankWebhookSignature(args: {
  rawBody: string;
  signature: string | null;
}): Promise<boolean> {
  if (!args.signature) return false;

  const publicKey = await getMonobankPublicKey();
  const verifier = crypto.createVerify('sha256');
  verifier.update(args.rawBody);
  verifier.end();

  const sig = Buffer.from(args.signature, 'base64');
  return verifier.verify(publicKey, sig);
}
