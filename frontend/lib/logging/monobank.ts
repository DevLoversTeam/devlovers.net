import 'server-only';

import crypto from 'node:crypto';

import { logError, logInfo, logWarn } from '@/lib/logging';

export const MONO_SIG_INVALID = 'MONO_SIG_INVALID' as const;
export const MONO_PUBKEY_REFRESHED = 'MONO_PUBKEY_REFRESHED' as const;
export const MONO_DEDUP = 'MONO_DEDUP' as const;
export const MONO_OLD_EVENT = 'MONO_OLD_EVENT' as const;
export const MONO_MISMATCH = 'MONO_MISMATCH' as const;
export const MONO_PAID_APPLIED = 'MONO_PAID_APPLIED' as const;
export const MONO_REFUND_APPLIED = 'MONO_REFUND_APPLIED' as const;
export const MONO_STORE_MODE = 'MONO_STORE_MODE' as const;
export const MONO_CREATE_INVOICE_FAILED = 'MONO_CREATE_INVOICE_FAILED' as const;
export const MONO_EXPIRED_RECONCILED = 'MONO_EXPIRED_RECONCILED' as const;

export const MONO_LOG_CODES = {
  SIG_INVALID: MONO_SIG_INVALID,
  PUBKEY_REFRESHED: MONO_PUBKEY_REFRESHED,
  DEDUP: MONO_DEDUP,
  OLD_EVENT: MONO_OLD_EVENT,
  MISMATCH: MONO_MISMATCH,
  PAID_APPLIED: MONO_PAID_APPLIED,
  REFUND_APPLIED: MONO_REFUND_APPLIED,
  STORE_MODE: MONO_STORE_MODE,
  CREATE_INVOICE_FAILED: MONO_CREATE_INVOICE_FAILED,
  EXPIRED_RECONCILED: MONO_EXPIRED_RECONCILED,
} as const;

export type MonobankLogCode =
  (typeof MONO_LOG_CODES)[keyof typeof MONO_LOG_CODES];

type LogPrimitive = string | number | boolean | null;

const ALLOWED_META_KEYS = new Set([
  'requestId',
  'route',
  'method',
  'provider',
  'mode',
  'storeDecision',
  'eventId',
  'eventKey',
  'rawSha256',
  'rawBytesLen',
  'hasXSign',
  'invoiceId',
  'orderId',
  'attemptId',
  'appliedResult',
  'deduped',
  'status',
  'fromStatus',
  'toStatus',
  'reason',
  'errorCode',
  'endpoint',
  'httpStatus',
  'durationMs',
  'runId',
  'job',
  'dryRun',
  'limit',
  'graceSeconds',
  'leaseSeconds',
  'ttlSeconds',
  'processed',
  'applied',
  'noop',
  'failed',
  'candidates',
  'claimed',
  'ageMs',
  'ageHoursThreshold',
  'count',
  'oldestAgeMinutes',
  'restockReason',
]);

const BLOCKED_META_KEY_RE =
  /(payload|body|header|authorization|cookie|token|email|phone|card|basket)/i;
const HEX_64_RE = /^[0-9a-f]{64}$/i;
const MAX_STRING_LEN = 180;

function sanitizeMetaValue(key: string, value: unknown): LogPrimitive | null {
  if (value === null) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if ((key === 'eventKey' || key === 'rawSha256') && !HEX_64_RE.test(trimmed))
      return null;

    return trimmed.length > MAX_STRING_LEN
      ? trimmed.slice(0, MAX_STRING_LEN)
      : trimmed;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }

  if (typeof value === 'boolean') return value;

  return null;
}

export function sanitizeMonobankMeta(
  meta?: Record<string, unknown>
): Record<string, LogPrimitive> | undefined {
  if (!meta) return undefined;

  const out: Record<string, LogPrimitive> = {};

  for (const [key, rawValue] of Object.entries(meta)) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (BLOCKED_META_KEY_RE.test(key)) continue;

    const value = sanitizeMetaValue(key, rawValue);
    if (value !== null) out[key] = value;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function monoLogInfo(
  code: MonobankLogCode,
  meta?: Record<string, unknown>
) {
  logInfo(code, sanitizeMonobankMeta(meta));
}

export function monoLogWarn(
  code: MonobankLogCode,
  meta?: Record<string, unknown>
) {
  logWarn(code, sanitizeMonobankMeta(meta));
}

export function monoLogError(
  code: MonobankLogCode,
  error: unknown,
  meta?: Record<string, unknown>
) {
  logError(code, error, sanitizeMonobankMeta(meta));
}

export function monoSha256Raw(raw: Uint8Array): string {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
