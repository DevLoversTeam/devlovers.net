import crypto from 'node:crypto';

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeNumber(value: number): number | string {
  if (Number.isFinite(value)) return value;
  return String(value);
}

function toCanonicalValue(value: unknown): CanonicalValue {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return value.toISOString();

  const valueType = typeof value;
  if (valueType === 'boolean') return value as boolean;
  if (valueType === 'number') return normalizeNumber(value as number);
  if (valueType === 'string') return value as string;
  if (valueType === 'bigint') return String(value);

  if (Array.isArray(value)) {
    return value.map(entry => toCanonicalValue(entry));
  }

  if (valueType === 'object') {
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source).sort((a, b) => a.localeCompare(b));
    const out: Record<string, CanonicalValue> = {};
    for (const key of keys) {
      const entry = source[key];
      if (entry === undefined) continue;
      out[key] = toCanonicalValue(entry);
    }
    return out;
  }

  return String(value);
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value));
}

export function buildDedupeKey(namespace: string, seed: unknown): string {
  const normalizedNamespace = namespace.trim().toLowerCase();
  const canonical = stableSerialize(seed);
  const hash = crypto
    .createHash('sha256')
    .update(`${normalizedNamespace}|v1|${canonical}`, 'utf8')
    .digest('hex');
  return `${normalizedNamespace}:v1:${hash}`;
}

export function buildPaymentEventDedupeKey(seed: unknown): string {
  return buildDedupeKey('payment_event', seed);
}

export function buildShippingEventDedupeKey(seed: unknown): string {
  return buildDedupeKey('shipping_event', seed);
}

export function buildAdminAuditDedupeKey(seed: unknown): string {
  return buildDedupeKey('admin_audit', seed);
}

export function buildNotificationOutboxDedupeKey(seed: unknown): string {
  return buildDedupeKey('notification_outbox', seed);
}
