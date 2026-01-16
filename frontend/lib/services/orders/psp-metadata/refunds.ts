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

export function normalizeRefundsFromMeta(
  meta: unknown,
  fallback: { currency: string; createdAt: string }
): RefundMetaRecord[] {
  const m = ensureMetaObject(meta) as any;

  if (Array.isArray(m.refunds)) return m.refunds as RefundMetaRecord[];

  const legacy = m.refund;
  if (legacy?.id) {
    return [
      {
        refundId: String(legacy.id),
        idempotencyKey: 'legacy:webhook',
        amountMinor: Number(legacy.amount ?? 0),
        currency: fallback.currency,
        createdAt: fallback.createdAt,
        createdBy: 'webhook',
        status: legacy.status ?? null,
      },
    ];
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
