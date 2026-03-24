const EMAIL_KEY_RE = /(^|[_-])(email|e-mail)([_-]|$)/i;
const PHONE_KEY_RE =
  /(^|[_-])(phone|mobile|tel|telephone|recipientphone|sendersphone|recipientsphone)([_-]|$)/i;
const ADDRESS_KEY_RE =
  /(^|[_-])(address|shippingaddress|billingaddress|addressline1|addressline2|line1|line2|street|streetaddress)([_-]|$)/i;
const SECRET_KEY_RE =
  /(^|[_-])(secret|token|password|authorization|cookie|apikey|api_key|clientsecret|webhooksecret|statustoken|signature|xsign|bearer)([_-]|$)/i;

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const STRIPE_SECRET_RE = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+\b/g;
const STRIPE_WEBHOOK_SECRET_RE = /\bwhsec_[A-Za-z0-9]+\b/g;
const TOKENISH_VALUE_RE =
  /\b(?:tok(?:en)?|secret|status[_-]?token)[._-][A-Za-z0-9._-]+\b/gi;
const PHONE_CANDIDATE_RE = /(?<!\w)\+?[\d()[\]\s.-]{9,}\d\b/g;

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;

type RedactionKind = 'email' | 'phone' | 'address' | 'secret';

function phoneLike(match: string): boolean {
  const digits = match.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function redactPhones(value: string): string {
  return value.replace(PHONE_CANDIDATE_RE, match =>
    phoneLike(match) ? '[REDACTED_PHONE]' : match
  );
}

export function sanitizeShopLogString(value: string): string {
  return redactPhones(
    value
      .replace(EMAIL_RE, '[REDACTED_EMAIL]')
      .replace(BEARER_RE, 'Bearer [REDACTED_SECRET]')
      .replace(JWT_RE, '[REDACTED_SECRET]')
      .replace(STRIPE_SECRET_RE, '[REDACTED_SECRET]')
      .replace(STRIPE_WEBHOOK_SECRET_RE, '[REDACTED_SECRET]')
      .replace(TOKENISH_VALUE_RE, '[REDACTED_SECRET]')
  );
}

function classifyKey(key: string): RedactionKind | null {
  if (SECRET_KEY_RE.test(key)) return 'secret';
  if (EMAIL_KEY_RE.test(key)) return 'email';
  if (PHONE_KEY_RE.test(key)) return 'phone';
  if (ADDRESS_KEY_RE.test(key)) return 'address';
  return null;
}

function sanitizeByKind(kind: RedactionKind, value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (kind === 'email') return '[REDACTED_EMAIL]';
  if (kind === 'phone') return '[REDACTED_PHONE]';
  if (kind === 'address') return '[REDACTED_ADDRESS]';
  return '[REDACTED_SECRET]';
}

export function sanitizeShopLogValue(
  value: unknown,
  depth = 0,
  parentKey?: string
): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';

  if (parentKey) {
    const kind = classifyKey(parentKey);
    if (kind) return sanitizeByKind(kind, value);
  }

  if (typeof value === 'string') return sanitizeShopLogString(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map(item => sanitizeShopLogValue(item, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      out[key] = sanitizeShopLogValue(nested, depth + 1, key);
    }
    return out;
  }

  return String(value);
}

export function sanitizeShopLogMeta(
  meta?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!meta) return undefined;

  const sanitized = sanitizeShopLogValue(meta, 0);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return undefined;
  }

  return sanitized as Record<string, unknown>;
}

export function sanitizeShopLogError(
  error: { name?: string; message: string; stack?: string } | null
): { name?: string; message: string; stack?: string } | null {
  if (!error) return null;

  return {
    ...(error.name ? { name: error.name } : null),
    message: sanitizeShopLogString(error.message),
    ...(error.stack ? { stack: sanitizeShopLogString(error.stack) } : null),
  };
}
