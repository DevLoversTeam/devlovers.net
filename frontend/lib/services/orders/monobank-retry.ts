import { InvalidPayloadError } from '@/lib/services/errors';

const NON_RETRYABLE_APPLY_CODES = new Set<string>([
  'INVALID_PAYLOAD',
  'ORDER_NOT_FOUND',
  'INVOICE_NOT_FOUND',
  'QUOTE_NOT_APPLICABLE',
  'QUOTE_ALREADY_ACCEPTED',
  'QUOTE_VERSION_CONFLICT',
  'QUOTE_CURRENCY_MISMATCH',
  'QUOTE_EXPIRED',
  'QUOTE_NOT_OFFERED',
  'QUOTE_STOCK_UNAVAILABLE',
  'QUOTE_NOT_ACCEPTED',
  'QUOTE_PAYMENT_WINDOW_EXPIRED',
  'QUOTE_INVENTORY_NOT_RESERVED',
  'QUOTE_INVALID_EXPIRY',
  'SLUG_CONFLICT',
  'PRICE_CONFIG_ERROR',
  'ORDER_STATE_INVALID',
]);

const TRANSIENT_APPLY_CODES = new Set<string>([
  'PSP_TIMEOUT',
  'PSP_UNAVAILABLE',
  'PSP_INVOICE_PERSIST_FAILED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  '40001',
  '40P01',
  '53300',
  '57P01',
]);

export function getMonobankApplyErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === 'string' ? maybeCode : null;
}

export function isRetryableApplyError(error: unknown): boolean {
  if (error instanceof InvalidPayloadError) return false;

  const code = getMonobankApplyErrorCode(error);
  if (!code) return true;
  if (NON_RETRYABLE_APPLY_CODES.has(code)) return false;

  return TRANSIENT_APPLY_CODES.has(code);
}
