import 'server-only';

const SHIPPING_PII_KEY_RE =
  /^(recipient|shippingaddress|shipping_address|recipientname|fullname|phone|email|comment|address|addressline1|addressline2|contactsender|sendersphone|recipientsphone)$/i;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_UA_E164_RE = /\+380\d{9}\b/g;
const PHONE_UA_LOCAL_RE = /\b0\d{9}\b/g;

function trimTo(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}...`;
}

function sanitizePrimitive(value: string): string {
  const redactedEmail = value.replace(EMAIL_RE, '[REDACTED_EMAIL]');
  const redactedPhone = redactedEmail
    .replace(PHONE_UA_E164_RE, '[REDACTED_PHONE]')
    .replace(PHONE_UA_LOCAL_RE, '[REDACTED_PHONE]');
  return trimTo(redactedPhone, 240);
}

function maskByKey(key: string, value: unknown): unknown {
  if (!SHIPPING_PII_KEY_RE.test(key)) return value;
  if (value === null || value === undefined) return value;
  return '[REDACTED]';
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 6) return '[TRUNCATED]';

  if (typeof value === 'string') return sanitizePrimitive(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map(item => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const masked = maskByKey(k, v);
      out[k] = sanitizeValue(masked, depth + 1);
    }
    return out;
  }

  return String(value);
}

export function sanitizeShippingErrorMessage(
  raw: unknown,
  fallback: string
): string {
  const base =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error && typeof raw.message === 'string'
        ? raw.message
        : '';

  const cleaned = sanitizePrimitive(base.trim());
  if (!cleaned) return fallback;
  return cleaned;
}

export function sanitizeShippingErrorForLog(
  error: unknown,
  fallbackMessage: string
): Error {
  const safeMessage = sanitizeShippingErrorMessage(error, fallbackMessage);
  const safe = new Error(safeMessage);
  safe.name = error instanceof Error ? error.name : 'ShippingError';
  return safe;
}

export function sanitizeShippingLogMeta(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const sanitized = sanitizeValue(meta, 0);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return undefined;
  }
  return sanitized as Record<string, unknown>;
}
