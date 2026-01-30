import 'server-only';

import crypto from 'node:crypto';

import { getMonobankEnv } from '@/lib/env/monobank';
// import { MONO_CCY, SHOP_CURRENCY } from '@/lib/shop/currency';
import { logError } from '@/lib/logging';
export const MONO_CCY = 980 as const;
export const MONO_CURRENCY = 'UAH' as const;

export type PspErrorCode =
  | 'PSP_TIMEOUT'
  | 'PSP_BAD_REQUEST'
  | 'PSP_AUTH_FAILED'
  | 'PSP_UNKNOWN';

export class PspError extends Error {
  code: PspErrorCode;
  safeMeta?: Record<string, unknown>;
  cause?: unknown;

  constructor(
    code: PspErrorCode,
    message: string,
    safeMeta?: Record<string, unknown>,
    cause?: unknown
  ) {
    super(message);
    this.code = code;
    this.safeMeta = safeMeta;
    this.cause = cause;
  }
}

export type MonobankInvoiceCreateInput = {
  amountMinor: number;
  validitySeconds?: number;
  reference: string;
  redirectUrl: string;
  webHookUrl: string;
  merchantPaymInfo?: Record<string, unknown>;
};

export type MonobankInvoiceCreateResult = {
  invoiceId: string;
  pageUrl: string;
  raw?: Record<string, unknown>;
};

export type MonobankInvoiceStatusResult = {
  invoiceId: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type MonobankCancelPaymentInput = {
  invoiceId: string;
  extRef: string;
  amountMinor?: number;
};

export type MonobankCancelPaymentResult = {
  invoiceId: string;
  status: string;
  raw?: Record<string, unknown>;
};

export type MonobankRemoveInvoiceResult = {
  invoiceId: string;
  removed: boolean;
  raw?: Record<string, unknown>;
};

export type MonobankWebhookPubKeyResult = {
  pubKeyPemBytes: Uint8Array;
};

export type MonobankWebhookVerifyResult = {
  ok: boolean;
};

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

type MonobankMerchantPaymInfo = {
  reference: string;
  destination: string;
};

type MonobankMerchantPaymInfoRaw = MonobankMerchantPaymInfo &
  Record<string, unknown>;

type MonobankInvoiceCreateRequest = {
  amount: number;
  ccy: number;
  paymentType: MonobankPaymentType;
  merchantPaymInfo: MonobankMerchantPaymInfoRaw;
  redirectUrl: string;
  webHookUrl: string;
  validity?: number;
};

type MonobankInvoiceCreateResponse = {
  invoiceId?: string;
  pageUrl?: string;
  paymentUrl?: string;
  invoiceUrl?: string;
};

type MonobankInvoiceStatusResponse = {
  invoiceId?: string;
  status?: string;
};

type MonobankCancelPaymentRequest = {
  invoiceId: string;
  extRef: string;
  amount?: number;
};

type MonobankCancelPaymentResponse = {
  invoiceId?: string;
  status?: string;
};

type MonobankRemoveInvoiceRequest = {
  invoiceId: string;
};

type MonobankRemoveInvoiceResponse = {
  invoiceId?: string;
  status?: string;
  removed?: boolean;
};

export function buildMonobankInvoicePayload(
  args: MonobankInvoiceCreateArgs
): MonobankInvoiceCreateRequest {
  const paymentType = args.paymentType ?? 'debit';
  if (paymentType !== 'debit') {
    throw new Error(`Unsupported paymentType: ${paymentType}`);
  }

  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) {
    throw new Error('Invalid invoice amount (minor units)');
  }

  const payload: MonobankInvoiceCreateRequest = {
    amount: args.amountMinor,
    ccy: MONO_CCY,
    paymentType,
    merchantPaymInfo: {
      reference: args.orderId,
      destination: `Order ${args.orderId}`,
    },
    redirectUrl: args.redirectUrl,
    webHookUrl: args.webhookUrl,
    // validity: ... (не чіпаємо в D0)
  };

  return payload;
}

type MonoRequestArgs = {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  timeoutMs: number;
  token?: string;
  baseUrl: string;
};

type MonoRequestResult<T> = {
  ok: true;
  data: T;
  status: number;
  headers?: Headers;
};

function normalizeEndpoint(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function pickStringField(
  value: unknown,
  keys: readonly string[]
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function parseErrorPayload(text: string): {
  monoCode?: string;
  monoMessage?: string;
  responseSnippet?: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return {
        monoCode: pickStringField(parsed, ['errCode', 'errorCode', 'code']),
        monoMessage: pickStringField(parsed, [
          'error',
          'message',
          'errorDescription',
          'description',
        ]),
      };
    }
    if (typeof parsed === 'string' && parsed.trim()) {
      return { responseSnippet: parsed.trim().slice(0, 200) };
    }
  } catch {
    return { responseSnippet: trimmed.slice(0, 200) };
  }

  return {};
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: unknown; message?: unknown };
  if (err.name === 'AbortError') return true;
  if (typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    return msg.includes('abort') || msg.includes('timeout');
  }
  return false;
}

async function requestMono<T>(
  args: MonoRequestArgs
): Promise<MonoRequestResult<T>> {
  const endpoint = args.path.startsWith('/') ? args.path : `/${args.path}`;
  const url = normalizeEndpoint(args.baseUrl, args.path);
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      const err = new Error('Request timed out');
      err.name = 'AbortError';
      reject(err);
    }, args.timeoutMs);
  });

  const headers: Record<string, string> = {};
  if (args.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (args.token) {
    headers['X-Token'] = args.token;
  }

  const fetchPromise = fetch(url, {
    method: args.method,
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
    signal: controller.signal,
  });
  // If timeout wins the race, fetch may reject later (AbortError). Prevent unhandled rejection noise.
  void fetchPromise.catch(() => undefined);

  try {
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    const status = res.status;
    const text = await res.text();

    if (!res.ok) {
      const parsed = parseErrorPayload(text);

      if (status === 401 || status === 403) {
        throw new PspError('PSP_AUTH_FAILED', 'Monobank auth failed', {
          endpoint,
          method: args.method,
          httpStatus: status,
        });
      }

      if (status >= 400 && status < 500) {
        throw new PspError('PSP_BAD_REQUEST', 'Monobank request rejected', {
          endpoint,
          method: args.method,
          httpStatus: status,
          ...(parsed.monoCode ? { monoCode: parsed.monoCode } : {}),
          ...(parsed.monoMessage ? { monoMessage: parsed.monoMessage } : {}),
          ...(parsed.responseSnippet
            ? { responseSnippet: parsed.responseSnippet }
            : {}),
        });
      }

      throw new PspError('PSP_UNKNOWN', 'Monobank request failed', {
        endpoint,
        method: args.method,
        httpStatus: status,
      });
    }

    let data: unknown = null;
    if (text.trim().length > 0) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { ok: true, data: data as T, status, headers: res.headers };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);

    if (error instanceof PspError) throw error;
    if (isAbortError(error)) {
      throw new PspError('PSP_TIMEOUT', 'Monobank request timed out', {
        endpoint,
        method: args.method,
        timeoutMs: args.timeoutMs,
      });
    }

    throw new PspError('PSP_UNKNOWN', 'Monobank request failed', {
      endpoint,
      method: args.method,
    });
  }
}

const PUBKEY_TTL_MS = 5 * 60 * 1000;

let _cachedWebhookKey: {
  key: Uint8Array;
  expiresAt: number;
} | null = null;

function getCachedWebhookKey(): Uint8Array | null {
  if (!_cachedWebhookKey) return null;
  if (Date.now() >= _cachedWebhookKey.expiresAt) {
    _cachedWebhookKey = null;
    return null;
  }
  return _cachedWebhookKey.key;
}

function cacheWebhookKey(key: Uint8Array): Uint8Array {
  _cachedWebhookKey = {
    key,
    expiresAt: Date.now() + PUBKEY_TTL_MS,
  };
  return key;
}

function parsePageUrl(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  return null;
}

function buildMonobankInvoicePayloadFromInput(
  args: MonobankInvoiceCreateInput
): MonobankInvoiceCreateRequest {
  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) {
    throw new Error('Invalid invoice amount (minor units)');
  }

  const merchantInfo =
    args.merchantPaymInfo && typeof args.merchantPaymInfo === 'object'
      ? { ...(args.merchantPaymInfo as Record<string, unknown>) }
      : {};

  const destinationValue =
    typeof (merchantInfo as { destination?: unknown }).destination === 'string'
      ? (merchantInfo as { destination: string }).destination.trim()
      : '';

  const destination = destinationValue.length
    ? destinationValue
    : `Order ${args.reference}`;

  const payload: MonobankInvoiceCreateRequest = {
    amount: args.amountMinor,
    ccy: MONO_CCY,
    paymentType: 'debit',
    merchantPaymInfo: {
      ...merchantInfo,
      reference: args.reference,
      destination,
    },
    redirectUrl: args.redirectUrl,
    webHookUrl: args.webHookUrl,
  };

  if (
    typeof args.validitySeconds === 'number' &&
    Number.isFinite(args.validitySeconds) &&
    args.validitySeconds > 0
  ) {
    payload.validity = Math.floor(args.validitySeconds);
  }

  return payload;
}

async function requestCreateInvoice(
  payload: MonobankInvoiceCreateRequest
): Promise<MonobankInvoiceResponse> {
  const env = getMonobankEnv();

  if (!env.paymentsEnabled || !env.token) {
    throw new Error('Monobank payments are disabled');
  }

  if (MONO_CURRENCY !== 'UAH') {
    throw new Error('Monobank invoice requires UAH currency');
  }

  const res = await requestMono<
    MonobankInvoiceCreateResponse & Record<string, unknown>
  >({
    method: 'POST',
    path: '/api/merchant/invoice/create',
    body: payload,
    timeoutMs: env.invoiceTimeoutMs,
    token: env.token,
    baseUrl: env.apiBaseUrl,
  });

  if (!res.data || typeof res.data !== 'object') {
    throw new Error('Monobank invoice create returned invalid payload');
  }

  const raw = res.data as MonobankInvoiceCreateResponse &
    Record<string, unknown>;
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

export async function createInvoice(
  args: MonobankInvoiceCreateInput
): Promise<MonobankInvoiceCreateResult> {
  const payload = buildMonobankInvoicePayloadFromInput(args);
  const created = await requestCreateInvoice(payload);
  return {
    invoiceId: created.invoiceId,
    pageUrl: created.pageUrl,
    raw: created.raw,
  };
}

export async function createMonobankInvoice(
  args: MonobankInvoiceCreateArgs
): Promise<MonobankInvoiceResponse> {
  const payload = buildMonobankInvoicePayload(args);
  return requestCreateInvoice(payload);
}

export async function getInvoiceStatus(
  invoiceId: string
): Promise<MonobankInvoiceStatusResult> {
  const env = getMonobankEnv();

  if (!env.paymentsEnabled || !env.token) {
    throw new Error('Monobank payments are disabled');
  }

  const res = await requestMono<
    MonobankInvoiceStatusResponse & Record<string, unknown>
  >({
    method: 'GET',
    path: `/api/merchant/invoice/status?invoiceId=${encodeURIComponent(
      invoiceId
    )}`,
    timeoutMs: env.invoiceTimeoutMs,
    token: env.token,
    baseUrl: env.apiBaseUrl,
  });

  if (!res.data || typeof res.data !== 'object') {
    throw new Error('Monobank invoice status returned invalid payload');
  }

  const raw = res.data as MonobankInvoiceStatusResponse &
    Record<string, unknown>;
  const normalizedInvoiceId =
    typeof raw.invoiceId === 'string' ? raw.invoiceId : '';
  const status = typeof raw.status === 'string' ? raw.status : '';

  if (!normalizedInvoiceId || !status) {
    throw new Error('Monobank invoice status missing invoiceId/status');
  }

  return { invoiceId: normalizedInvoiceId, status, raw };
}

export async function cancelInvoicePayment(
  args: MonobankCancelPaymentInput
): Promise<MonobankCancelPaymentResult> {
  const env = getMonobankEnv();

  if (!env.paymentsEnabled || !env.token) {
    throw new Error('Monobank payments are disabled');
  }

  const payload: MonobankCancelPaymentRequest = {
    invoiceId: args.invoiceId,
    extRef: args.extRef,
  };

  if (
    typeof args.amountMinor === 'number' &&
    Number.isFinite(args.amountMinor) &&
    args.amountMinor > 0
  ) {
    payload.amount = Math.floor(args.amountMinor);
  }

  const res = await requestMono<
    MonobankCancelPaymentResponse & Record<string, unknown>
  >({
    method: 'POST',
    path: '/api/merchant/invoice/cancel',
    body: payload,
    timeoutMs: env.invoiceTimeoutMs,
    token: env.token,
    baseUrl: env.apiBaseUrl,
  });

  if (!res.data || typeof res.data !== 'object') {
    throw new Error('Monobank cancel payment returned invalid payload');
  }

  const raw = res.data as MonobankCancelPaymentResponse &
    Record<string, unknown>;
  const normalizedInvoiceId =
    typeof raw.invoiceId === 'string' ? raw.invoiceId : '';
  const status = typeof raw.status === 'string' ? raw.status : '';

  if (!normalizedInvoiceId || !status) {
    throw new Error('Monobank cancel payment missing invoiceId/status');
  }

  return { invoiceId: normalizedInvoiceId, status, raw };
}

export async function removeInvoice(
  invoiceId: string
): Promise<MonobankRemoveInvoiceResult> {
  const env = getMonobankEnv();

  if (!env.paymentsEnabled || !env.token) {
    throw new Error('Monobank payments are disabled');
  }

  const payload: MonobankRemoveInvoiceRequest = { invoiceId };
  const res = await requestMono<unknown>({
    method: 'POST',
    path: '/api/merchant/invoice/remove',
    body: payload,
    timeoutMs: env.invoiceTimeoutMs,
    token: env.token,
    baseUrl: env.apiBaseUrl,
  });

  // Monobank can return 200 with empty body for invoice/remove.
  // Treat 2xx as success even when res.data is null.
  if (res.data === null || res.data === undefined) {
    return { invoiceId, removed: true };
  }

  // If body exists, keep it as raw for observability, but do not require invoiceId/status.
  if (typeof res.data !== 'object') {
    throw new Error('Monobank remove invoice returned invalid payload');
  }

  const raw = res.data as MonobankRemoveInvoiceResponse &
    Record<string, unknown>;

  const removed =
    typeof raw.removed === 'boolean'
      ? raw.removed
      : typeof raw.status === 'string'
        ? raw.status === 'removed'
        : true;

  return { invoiceId, removed, raw };
}

export async function cancelMonobankInvoice(invoiceId: string): Promise<void> {
  const env = getMonobankEnv();
  if (!env.paymentsEnabled || !env.token) return;

  try {
    await requestMono<unknown>({
      method: 'POST',
      path: '/api/merchant/invoice/cancel',
      body: { invoiceId },
      timeoutMs: env.invoiceTimeoutMs,
      token: env.token,
      baseUrl: env.apiBaseUrl,
    });
  } catch (error) {
    logError('monobank_invoice_cancel_failed', error, { invoiceId });
  }
}

function normalizePemPublicKey(raw: string): string {
  if (raw.includes('BEGIN PUBLIC KEY')) return raw;
  const stripped = raw.replace(/\s+/g, '');
  const chunks = stripped.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join('\n')}\n-----END PUBLIC KEY-----`;
}

export async function fetchWebhookPubKey(options?: {
  forceRefresh?: boolean;
}): Promise<Uint8Array> {
  if (!options?.forceRefresh) {
    const cached = getCachedWebhookKey();
    if (cached) return cached;
  }

  const env = getMonobankEnv();
  if (env.publicKey) {
    const pem = normalizePemPublicKey(env.publicKey);
    return cacheWebhookKey(Buffer.from(pem));
  }

  if (!env.token || !env.paymentsEnabled) {
    throw new Error('Monobank public key unavailable');
  }

  const res = await requestMono<unknown>({
    method: 'GET',
    path: '/api/merchant/pubkey',
    timeoutMs: env.invoiceTimeoutMs,
    token: env.token,
    baseUrl: env.apiBaseUrl,
  });

  let key = '';
  if (typeof res.data === 'string') {
    key = res.data.trim();
  } else if (res.data && typeof res.data === 'object') {
    const candidate = (res.data as { key?: unknown }).key;
    if (typeof candidate === 'string') key = candidate.trim();
  }

  if (!key) throw new Error('Monobank pubkey missing in response');

  const pem = normalizePemPublicKey(key);
  return cacheWebhookKey(Buffer.from(pem));
}

export function verifyWebhookSignature(
  rawBodyBytes: Uint8Array,
  xSignBase64: string | null,
  pubKeyPemBytes: Uint8Array
): boolean {
  if (!xSignBase64) return false;

  try {
    const sig = Buffer.from(xSignBase64, 'base64');

    const data = Buffer.isBuffer(rawBodyBytes)
      ? rawBodyBytes
      : Buffer.from(rawBodyBytes);

    const key = Buffer.isBuffer(pubKeyPemBytes)
      ? pubKeyPemBytes
      : Buffer.from(pubKeyPemBytes);

    return crypto.verify('sha256', data, key, sig);
  } catch {
    return false;
  }
}

export async function verifyWebhookSignatureWithRefresh(args: {
  rawBodyBytes: Uint8Array;
  signature: string | null;
}): Promise<boolean> {
  if (!args.signature) return false;

  let key: Uint8Array;
  try {
    key = await fetchWebhookPubKey();
  } catch {
    return false;
  }

  if (verifyWebhookSignature(args.rawBodyBytes, args.signature, key)) {
    return true;
  }

  try {
    const refreshed = await fetchWebhookPubKey({ forceRefresh: true });
    return verifyWebhookSignature(args.rawBodyBytes, args.signature, refreshed);
  } catch {
    return false;
  }
}

export async function getMonobankPublicKey(): Promise<string> {
  const key = await fetchWebhookPubKey();
  return Buffer.from(key).toString('utf8');
}

export async function verifyMonobankWebhookSignature(args: {
  rawBody: string;
  signature: string | null;
}): Promise<boolean> {
  const rawBodyBytes = Buffer.from(args.rawBody, 'utf8');
  return verifyWebhookSignatureWithRefresh({
    rawBodyBytes,
    signature: args.signature,
  });
}
