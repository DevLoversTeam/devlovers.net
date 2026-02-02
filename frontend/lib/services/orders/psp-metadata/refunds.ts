export type RefundMetaRecord = {
  refundId: string;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  createdBy: string;
  status?: string | null;
};

function ensureMetaObject(meta: unknown): Record<string, unknown> {
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

function toNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function toCurrency(v: unknown, fallback: string): string {
  const s = toNonEmptyString(v);
  if (!s) return fallback;
  return s.toUpperCase();
}

function toAmountMinor(v: unknown): number | null {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim().length
        ? Number(v)
        : NaN;

  if (!Number.isFinite(n)) return null;

  const i = Math.trunc(n);
  if (i < 0) return null;
  if (!Number.isSafeInteger(i)) return null;

  return i;
}

function normalizeRefundRecord(
  input: unknown,
  fallback: { currency: string; createdAt: string }
): RefundMetaRecord | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const r = input as Record<string, unknown>;

  const refundId =
    toNonEmptyString(r.refundId) ??
    toNonEmptyString((r as any).id) ??
    (typeof (r as any).refundId === 'number'
      ? String((r as any).refundId)
      : typeof (r as any).id === 'number'
        ? String((r as any).id)
        : null);

  if (!refundId) return null;

  const idempotencyKey = toNonEmptyString(r.idempotencyKey) ?? 'meta:unknown';

  const amountMinor =
    toAmountMinor(r.amountMinor) ??
    toAmountMinor((r as any).amount) ??
    toAmountMinor((r as any).amount_minor);

  if (amountMinor === null) return null;

  const currency = toCurrency(r.currency, fallback.currency);
  const createdAt = toNonEmptyString(r.createdAt) ?? fallback.createdAt;
  const createdBy = toNonEmptyString(r.createdBy) ?? 'unknown';

  const statusRaw = (r as any).status;
  const status =
    statusRaw == null ? null : typeof statusRaw === 'string' ? statusRaw : null;

  return {
    refundId,
    idempotencyKey,
    amountMinor,
    currency,
    createdAt,
    createdBy,
    status,
  };
}

export function normalizeRefundsFromMeta(
  meta: unknown,
  fallback: { currency: string; createdAt: string }
): RefundMetaRecord[] {
  const m = ensureMetaObject(meta) as any;

  if (Array.isArray(m.refunds)) {
    return (m.refunds as unknown[])
      .map(r => normalizeRefundRecord(r, fallback))
      .filter((r): r is RefundMetaRecord => r !== null);
  }

  const legacy = m.refund;
  if (legacy?.id) {
    const normalized = normalizeRefundRecord(
      {
        refundId: legacy.id,
        idempotencyKey: 'legacy:webhook',
        amountMinor: legacy.amount ?? 0,
        currency: fallback.currency,
        createdAt: fallback.createdAt,
        createdBy: 'webhook',
        status: legacy.status ?? null,
      },
      fallback
    );

    return normalized ? [normalized] : [];
  }

  return [];
}

export function appendRefundToMeta(params: {
  prevMeta: unknown;
  record: RefundMetaRecord;
}): Record<string, unknown> {
  const base = ensureMetaObject(params.prevMeta) as any;

  const refunds = normalizeRefundsFromMeta(base, {
    currency: params.record.currency,
    createdAt: params.record.createdAt,
  });

  const exists = refunds.some(
    r =>
      r.refundId === params.record.refundId ||
      r.idempotencyKey === params.record.idempotencyKey
  );

  return {
    ...base,
    refunds: exists ? refunds : [...refunds, params.record],
    refundInitiatedAt: base.refundInitiatedAt ?? params.record.createdAt,
  };
}
