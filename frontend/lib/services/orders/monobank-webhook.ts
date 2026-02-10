import 'server-only';

import crypto from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { logError, logInfo } from '@/lib/logging';
import { InvalidPayloadError } from '@/lib/services/errors';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';
import { restockOrder } from '@/lib/services/orders/restock';

type WebhookMode = 'apply' | 'store' | 'drop';

type NormalizedWebhook = {
  invoiceId: string;
  status: string;
  amount: number | null;
  ccy: number | null;
  reference: string | null;
};

type ApplyResult =
  | 'applied'
  | 'applied_noop'
  | 'applied_with_issue'
  | 'stored'
  | 'dropped'
  | 'unmatched'
  | 'deduped';

type MonobankApplyOutcome = {
  appliedResult: ApplyResult;
  restockOrderId: string | null;
  restockReason: 'failed' | 'refunded' | null;
  attemptId: string | null;
  orderId: string | null;
};

type AttemptRow = {
  id: string;
  order_id: string;
  status: string;
  expected_amount_minor: number | null;
  provider_payment_intent_id: string | null;
  provider_modified_at: Date | string | null;
};

type OrderRow = {
  id: string;
  payment_status: string;
  payment_provider: string;
  status: string;
  currency: string;
  total_amount_minor: number;
  psp_metadata: Record<string, unknown> | null;
};

type PaymentStatusTarget = Parameters<
  typeof guardedPaymentStatusUpdate
>[0]['to'];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CLAIM_TTL_MS = (() => {
  const raw = process.env.MONO_WEBHOOK_CLAIM_TTL_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
})();

const INSTANCE_ID = (() => {
  const base =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.HOSTNAME ?? 'local';
  const suffix = crypto.randomUUID().slice(0, 8);
  const value = `${base}:${suffix}`;
  return value.length > 64 ? value.slice(0, 64) : value;
})();

function toIssueMessage(error: unknown): string {
  const msg =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : 'Unknown error';
  return msg.length > 500 ? msg.slice(0, 500) : msg;
}

function normalizeStatus(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function normalizeWebhookPayload(raw: Record<string, unknown>): {
  raw: Record<string, unknown>;
  normalized: NormalizedWebhook;
  providerModifiedAt: Date | null;
} {
  const invoiceId =
    typeof raw.invoiceId === 'string' ? raw.invoiceId.trim() : '';
  const status = normalizeStatus(raw.status);

  if (!invoiceId || !status) {
    throw new InvalidPayloadError('Invalid webhook payload', {
      code: 'INVALID_PAYLOAD',
    });
  }

  const amount =
    typeof raw.amount === 'number' && Number.isFinite(raw.amount)
      ? Math.trunc(raw.amount)
      : null;
  const ccy =
    typeof raw.ccy === 'number' && Number.isFinite(raw.ccy)
      ? Math.trunc(raw.ccy)
      : null;
  const reference =
    typeof raw.reference === 'string' && raw.reference.trim()
      ? raw.reference.trim()
      : null;

  const providerModifiedAt = extractProviderModifiedAt(raw);

  return {
    raw,
    normalized: {
      invoiceId,
      status,
      amount,
      ccy,
      reference,
    },
    providerModifiedAt,
  };
}

function parseWebhookPayload(rawBody: string): {
  raw: Record<string, unknown>;
  normalized: NormalizedWebhook;
  providerModifiedAt: Date | null;
} {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new InvalidPayloadError('Invalid JSON payload', {
      code: 'INVALID_PAYLOAD',
    });
  }

  return normalizeWebhookPayload(raw);
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e11 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function extractProviderModifiedAt(raw: Record<string, unknown>): Date | null {
  const candidates = [
    raw.modifiedDate,
    raw.modifiedAt,
    raw.updatedAt,
    raw.createdDate,
    raw.createdAt,
    raw.time,
    raw.timestamp,
  ];

  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms !== null) return new Date(ms);
  }

  return null;
}

function buildEventKey(rawSha256: string): string {
  return rawSha256;
}

async function insertEvent(args: {
  eventKey: string;
  rawSha256: string;
  rawPayload: Record<string, unknown>;
  normalizedPayload: NormalizedWebhook;
  providerModifiedAt: Date | null;
}): Promise<{ eventId: string | null; deduped: boolean }> {
  const inserted = await db
    .insert(monobankEvents)
    .values({
      eventKey: args.eventKey,
      invoiceId: args.normalizedPayload.invoiceId,
      status: args.normalizedPayload.status,
      amount: args.normalizedPayload.amount ?? null,
      ccy: args.normalizedPayload.ccy ?? null,
      reference: args.normalizedPayload.reference ?? null,
      rawPayload: args.rawPayload,
      normalizedPayload: args.normalizedPayload,
      providerModifiedAt: args.providerModifiedAt ?? null,
      rawSha256: args.rawSha256,
    })
    .onConflictDoNothing()
    .returning({ id: monobankEvents.id });

  const insertedId = inserted[0]?.id ?? null;
  if (insertedId) {
    return { eventId: insertedId, deduped: false };
  }

  const existing = (await db.execute(sql`
    select id
    from monobank_events
    where event_key = ${args.eventKey} or raw_sha256 = ${args.rawSha256}
    limit 1
  `)) as unknown as { rows?: Array<{ id?: string }> };

  const existingId = existing.rows?.[0]?.id ?? null;
  return { eventId: existingId, deduped: true };
}

async function claimMonobankEvent(args: {
  eventId: string;
  instanceId: string;
  ttlMs: number;
}): Promise<boolean> {
  const now = new Date();
  const claimExpiresAt = new Date(now.getTime() + args.ttlMs);

  const claimed = (await db.execute(sql`
    update monobank_events
    set claimed_at = ${now},
        claim_expires_at = ${claimExpiresAt},
        claimed_by = ${args.instanceId}
    where id = ${args.eventId}::uuid
      and applied_at is null
      and (claim_expires_at is null or claim_expires_at < ${now})
    returning id
  `)) as unknown as { rows?: Array<{ id?: string }> };

  return Boolean(claimed.rows?.[0]?.id);
}

function amountMismatch(args: {
  payloadAmount: number | null;
  payloadCcy: number | null;
  orderCurrency: string;
  orderTotal: number;
  expectedAmount: number | null;
}): { mismatch: boolean; reason?: string } {
  if (args.orderCurrency !== 'UAH') {
    return { mismatch: true, reason: 'order_currency_mismatch' };
  }

  if (args.payloadCcy !== null && args.payloadCcy !== 980) {
    return { mismatch: true, reason: 'payload_currency_mismatch' };
  }

  const expected = args.expectedAmount ?? args.orderTotal;
  if (
    args.payloadAmount !== null &&
    Number.isFinite(args.payloadAmount) &&
    args.payloadAmount !== expected
  ) {
    return { mismatch: true, reason: 'amount_mismatch' };
  }

  if (expected !== args.orderTotal) {
    return { mismatch: true, reason: 'expected_amount_mismatch' };
  }

  return { mismatch: false };
}

function buildApplyOutcome(args: {
  appliedResult: ApplyResult;
  restockOrderId?: string | null;
  restockReason?: 'failed' | 'refunded' | null;
  attemptId?: string | null;
  orderId?: string | null;
}): MonobankApplyOutcome {
  return {
    appliedResult: args.appliedResult,
    restockOrderId: args.restockOrderId ?? null,
    restockReason: args.restockReason ?? null,
    attemptId: args.attemptId ?? null,
    orderId: args.orderId ?? null,
  };
}

function getReferenceAttemptId(reference: string | null): string | null {
  return reference && UUID_RE.test(reference) ? reference : null;
}

async function fetchAttemptForWebhook(args: {
  invoiceId: string;
  referenceAttemptId: string | null;
}): Promise<AttemptRow | null> {
  const attemptRes = (await db.execute(sql`
    select id, order_id, status, expected_amount_minor, provider_payment_intent_id, provider_modified_at
    from payment_attempts
    where provider = 'monobank'
      and (
        (${args.referenceAttemptId}::uuid is not null and id = ${args.referenceAttemptId}::uuid)
        or provider_payment_intent_id = ${args.invoiceId}
      )
    order by case
      when (${args.referenceAttemptId}::uuid is not null and id = ${args.referenceAttemptId}::uuid) then 1
      else 0
    end desc
    limit 1
  `)) as unknown as { rows?: AttemptRow[] };

  return attemptRes.rows?.[0] ?? null;
}

async function fetchOrderForAttempt(orderId: string): Promise<OrderRow | null> {
  const orderRes = (await db.execute(sql`
    select id, payment_status, payment_provider, status, currency, total_amount_minor, psp_metadata
    from orders
    where id = ${orderId}::uuid
    limit 1
  `)) as unknown as { rows?: OrderRow[] };

  return orderRes.rows?.[0] ?? null;
}

function computeNextProviderModifiedAt(
  providerModifiedAt: Date | null,
  attemptProviderModifiedAt: Date | null
): Date | null {
  if (
    providerModifiedAt &&
    (!attemptProviderModifiedAt || providerModifiedAt > attemptProviderModifiedAt)
  ) {
    return providerModifiedAt;
  }

  return attemptProviderModifiedAt;
}

async function transitionPaymentStatus(args: {
  orderId: string;
  status: string;
  eventId: string;
  to: PaymentStatusTarget;
}): Promise<{ ok: boolean; applied: boolean; reason?: string }> {
  const res = await guardedPaymentStatusUpdate({
    orderId: args.orderId,
    paymentProvider: 'monobank',
    to: args.to,
    source: 'monobank_webhook',
    note: `event:${args.eventId}:${args.status}`,
  });
  const ok =
    res.applied || (res.currentProvider === 'monobank' && res.from === args.to);

  return {
    ok,
    applied: res.applied,
    reason: ok ? undefined : res.reason,
  };
}

async function persistEventOutcome(args: {
  eventId: string;
  now: Date;
  appliedResult: ApplyResult;
  appliedErrorCode?: string;
  appliedErrorMessage?: string;
  attemptId?: string;
  orderId?: string;
}): Promise<void> {
  const patch: {
    appliedAt: Date;
    appliedResult: ApplyResult;
    appliedErrorCode?: string;
    appliedErrorMessage?: string;
    attemptId?: string;
    orderId?: string;
  } = {
    appliedAt: args.now,
    appliedResult: args.appliedResult,
  };

  if (args.appliedErrorCode !== undefined) {
    patch.appliedErrorCode = args.appliedErrorCode;
  }
  if (args.appliedErrorMessage !== undefined) {
    patch.appliedErrorMessage = args.appliedErrorMessage;
  }
  if (args.attemptId !== undefined) {
    patch.attemptId = args.attemptId;
  }
  if (args.orderId !== undefined) {
    patch.orderId = args.orderId;
  }

  await db
    .update(monobankEvents)
    .set(patch)
    .where(eq(monobankEvents.id, args.eventId));
}

function buildMergedMetaSql(normalized: NormalizedWebhook) {
  const metadataPatch = {
    monobank: {
      invoiceId: normalized.invoiceId,
      status: normalized.status,
      amount: normalized.amount ?? null,
      ccy: normalized.ccy ?? null,
      reference: normalized.reference ?? null,
    },
  };

  return sql`coalesce(${orders.pspMetadata}, '{}'::jsonb) || ${JSON.stringify(
    metadataPatch
  )}::jsonb`;
}

async function applyWebhookToMatchedOrderAttemptEvent(args: {
  eventId: string;
  now: Date;
  normalized: NormalizedWebhook;
  providerModifiedAt: Date | null;
  attemptRow: AttemptRow;
  orderRow: OrderRow;
}): Promise<MonobankApplyOutcome> {
  const { eventId, now, normalized, providerModifiedAt, attemptRow, orderRow } =
    args;

  const status = normalized.status;
  const attemptProviderModifiedAt = attemptRow.provider_modified_at
    ? new Date(attemptRow.provider_modified_at)
    : null;
  const nextProviderModifiedAt = computeNextProviderModifiedAt(
    providerModifiedAt,
    attemptProviderModifiedAt
  );
  const mergedMetaSql = buildMergedMetaSql(normalized);

  if (
    providerModifiedAt &&
    attemptProviderModifiedAt &&
    providerModifiedAt <= attemptProviderModifiedAt
  ) {
    const appliedResult: ApplyResult = 'applied_noop';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      appliedErrorCode: 'OUT_OF_ORDER',
      appliedErrorMessage: 'provider_modified_at older than latest',
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  const mismatch = amountMismatch({
    payloadAmount: normalized.amount,
    payloadCcy: normalized.ccy,
    orderCurrency: orderRow.currency,
    orderTotal: Number(orderRow.total_amount_minor ?? 0),
    expectedAmount:
      attemptRow.expected_amount_minor != null
        ? Number(attemptRow.expected_amount_minor)
        : null,
  });

  if (mismatch.mismatch) {
    let appliedResult: ApplyResult = 'applied_with_issue';

    if (orderRow.payment_status !== 'paid') {
      await db
        .update(paymentAttempts)
        .set({
          status: 'failed',
          finalizedAt: now,
          updatedAt: now,
          lastErrorCode: 'AMOUNT_MISMATCH',
          lastErrorMessage: mismatch.reason ?? 'Mismatch',
          providerModifiedAt: nextProviderModifiedAt ?? null,
        })
        .where(eq(paymentAttempts.id, attemptRow.id));

      const tr = await transitionPaymentStatus({
        orderId: orderRow.id,
        status,
        eventId,
        to: 'needs_review',
      });

      if (tr.ok) {
        await db
          .update(orders)
          .set({
            failureCode: 'MONO_AMOUNT_MISMATCH',
            failureMessage: mismatch.reason ?? 'Webhook amount/currency mismatch.',
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, orderRow.id),
              eq(orders.paymentProvider, 'monobank' as any)
            )
          );
      } else {
        appliedResult = 'applied_with_issue';
      }
    }

    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      appliedErrorCode: 'AMOUNT_MISMATCH',
      appliedErrorMessage: mismatch.reason ?? 'Mismatch',
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (
    orderRow.payment_status === 'paid' &&
    (status === 'success' || status === 'processing' || status === 'created')
  ) {
    const appliedResult: ApplyResult = 'applied_noop';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (orderRow.payment_status === 'needs_review') {
    const appliedResult: ApplyResult = 'applied_noop';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (
    (orderRow.payment_status === 'failed' ||
      orderRow.payment_status === 'refunded') &&
    status === 'success'
  ) {
    let appliedResult: ApplyResult = 'applied_with_issue';

    const tr = await transitionPaymentStatus({
      orderId: orderRow.id,
      status,
      eventId,
      to: 'needs_review',
    });
    if (tr.ok) {
      await db
        .update(orders)
        .set({
          failureCode: 'MONO_OUT_OF_ORDER',
          failureMessage: `Out-of-order event: ${orderRow.payment_status} -> success`,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, orderRow.id),
            eq(orders.paymentProvider, 'monobank' as any)
          )
        );
    } else {
      appliedResult = 'applied_with_issue';
    }

    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      appliedErrorCode: 'OUT_OF_ORDER',
      appliedErrorMessage: `Out-of-order: ${orderRow.payment_status} -> success`,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (status === 'success') {
    const tr = await transitionPaymentStatus({
      orderId: orderRow.id,
      status,
      eventId,
      to: 'paid',
    });

    if (!tr.ok) {
      const appliedResult: ApplyResult = 'applied_with_issue';
      await persistEventOutcome({
        eventId,
        now,
        appliedResult,
        appliedErrorCode: 'PAYMENT_STATE_BLOCKED',
        appliedErrorMessage: `blocked transition to paid (${tr.reason})`,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });

      return buildApplyOutcome({
        appliedResult,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });
    }

    await db
      .update(orders)
      .set({
        status: 'PAID',
        pspChargeId: normalized.invoiceId,
        pspMetadata: mergedMetaSql as any,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, orderRow.id),
          eq(orders.paymentProvider, 'monobank' as any)
        )
      );

    await db
      .update(paymentAttempts)
      .set({
        status: 'succeeded',
        finalizedAt: now,
        updatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        providerModifiedAt: nextProviderModifiedAt ?? null,
      })
      .where(eq(paymentAttempts.id, attemptRow.id));

    const appliedResult: ApplyResult = 'applied';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (status === 'processing' || status === 'created') {
    const appliedResult: ApplyResult = 'applied_noop';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  if (status === 'failure' || status === 'expired' || status === 'reversed') {
    const isRefunded = status === 'reversed';
    const nextPaymentStatus: PaymentStatusTarget = isRefunded
      ? 'refunded'
      : 'failed';

    const tr = await transitionPaymentStatus({
      orderId: orderRow.id,
      status,
      eventId,
      to: nextPaymentStatus,
    });

    if (!tr.ok) {
      const appliedResult: ApplyResult = 'applied_with_issue';
      await persistEventOutcome({
        eventId,
        now,
        appliedResult,
        appliedErrorCode: 'PAYMENT_STATE_BLOCKED',
        appliedErrorMessage: `blocked transition to ${nextPaymentStatus} (${tr.reason})`,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });

      return buildApplyOutcome({
        appliedResult,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });
    }

    await db
      .update(orders)
      .set({
        pspStatusReason: status,
        pspMetadata: mergedMetaSql as any,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, orderRow.id),
          eq(orders.paymentProvider, 'monobank' as any)
        )
      );

    await db
      .update(paymentAttempts)
      .set({
        status: isRefunded ? 'canceled' : 'failed',
        finalizedAt: now,
        updatedAt: now,
        lastErrorCode: status,
        lastErrorMessage: `Monobank status: ${status}`,
        providerModifiedAt: nextProviderModifiedAt ?? null,
      })
      .where(eq(paymentAttempts.id, attemptRow.id));

    const appliedResult: ApplyResult = 'applied';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      restockReason: isRefunded ? 'refunded' : 'failed',
      restockOrderId: orderRow.id,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
  }

  const appliedResult: ApplyResult = 'applied_noop';
  await persistEventOutcome({
    eventId,
    now,
    appliedResult,
    appliedErrorCode: 'UNKNOWN_STATUS',
    appliedErrorMessage: `Unrecognized Monobank status: ${status}`,
    attemptId: attemptRow.id,
    orderId: orderRow.id,
  });

  return buildApplyOutcome({
    appliedResult,
    attemptId: attemptRow.id,
    orderId: orderRow.id,
  });
}

async function applyWebhookToOrderAttemptEvent(args: {
  eventId: string;
  normalized: NormalizedWebhook;
  providerModifiedAt: Date | null;
}): Promise<MonobankApplyOutcome> {
  const now = new Date();
  const referenceAttemptId = getReferenceAttemptId(args.normalized.reference);
  const attemptRow = await fetchAttemptForWebhook({
    invoiceId: args.normalized.invoiceId,
    referenceAttemptId,
  });

  if (!attemptRow) {
    const appliedResult: ApplyResult = 'unmatched';
    await persistEventOutcome({
      eventId: args.eventId,
      now,
      appliedResult,
      appliedErrorCode: 'ATTEMPT_NOT_FOUND',
      appliedErrorMessage: 'No matching payment attempt',
    });

    return buildApplyOutcome({ appliedResult });
  }

  const orderRow = await fetchOrderForAttempt(attemptRow.order_id);
  if (!orderRow) {
    const appliedResult: ApplyResult = 'unmatched';
    await persistEventOutcome({
      eventId: args.eventId,
      now,
      appliedResult,
      appliedErrorCode: 'ORDER_NOT_FOUND',
      appliedErrorMessage: 'Order not found for attempt',
      attemptId: attemptRow.id,
    });

    return buildApplyOutcome({
      appliedResult,
      attemptId: attemptRow.id,
    });
  }

  return applyWebhookToMatchedOrderAttemptEvent({
    eventId: args.eventId,
    now,
    normalized: args.normalized,
    providerModifiedAt: args.providerModifiedAt,
    attemptRow,
    orderRow,
  });
}

export async function applyMonoWebhookEvent(args: {
  rawBody: string;
  requestId: string;
  mode: WebhookMode;
  rawSha256: string;
  parsedPayload?: Record<string, unknown>;
  eventKey?: string;
}): Promise<{
  deduped: boolean;
  appliedResult: ApplyResult;
  eventId: string | null;
  invoiceId: string;
}> {
  const parsed = args.parsedPayload
    ? normalizeWebhookPayload(args.parsedPayload)
    : parseWebhookPayload(args.rawBody);

  if (
    typeof args.rawSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(args.rawSha256)
  ) {
    throw new InvalidPayloadError('Missing or invalid rawSha256', {
      code: 'INVALID_PAYLOAD',
    });
  }

  const rawSha256 = args.rawSha256;
  const eventKey = args.eventKey ?? buildEventKey(rawSha256);

  const { eventId, deduped } = await insertEvent({
    eventKey,
    rawSha256,
    rawPayload: parsed.raw,
    normalizedPayload: parsed.normalized,
    providerModifiedAt: parsed.providerModifiedAt,
  });
  if (!eventId) {
    logInfo('monobank_webhook_deduped', {
      requestId: args.requestId,
      invoiceId: parsed.normalized.invoiceId,
      status: parsed.normalized.status,
    });
    return {
      deduped: true,
      appliedResult: 'deduped',
      eventId: null,
      invoiceId: parsed.normalized.invoiceId,
    };
  }

  if (args.mode === 'store' || args.mode === 'drop') {
    const now = new Date();
    const appliedResult: ApplyResult =
      args.mode === 'drop' ? 'dropped' : 'stored';

    await db
      .update(monobankEvents)
      .set({
        appliedAt: now,
        appliedResult,
      })
      .where(eq(monobankEvents.id, eventId));

    return {
      deduped,
      appliedResult,
      eventId,
      invoiceId: parsed.normalized.invoiceId,
    };
  }

  const claimed = await claimMonobankEvent({
    eventId,
    instanceId: INSTANCE_ID,
    ttlMs: CLAIM_TTL_MS,
  });

  if (!claimed) {
    return {
      deduped,
      appliedResult: deduped ? 'deduped' : 'applied_noop',
      eventId,
      invoiceId: parsed.normalized.invoiceId,
    };
  }

  const outcome = await applyWebhookToOrderAttemptEvent({
    eventId,
    normalized: parsed.normalized,
    providerModifiedAt: parsed.providerModifiedAt,
  });

  const { appliedResult, restockOrderId, restockReason } = outcome;

  if (restockReason && restockOrderId) {
    try {
      await restockOrder(restockOrderId, {
        reason: restockReason,
        workerId: 'monobank_webhook',
      });
    } catch (error) {
      logError('monobank_webhook_restock_failed', error, {
        requestId: args.requestId,
        invoiceId: parsed.normalized.invoiceId,
      });
      const now = new Date();
      const issueMsg = toIssueMessage(error);

      if (eventId) {
        await db
          .update(monobankEvents)
          .set({
            appliedResult: 'applied_with_issue',
            appliedErrorCode:
              sql`coalesce(${monobankEvents.appliedErrorCode}, 'RESTOCK_FAILED')` as any,
            appliedErrorMessage:
              sql`coalesce(${monobankEvents.appliedErrorMessage}, ${issueMsg})` as any,
          })
          .where(eq(monobankEvents.id, eventId));
      }

      if (outcome.attemptId) {
        await db
          .update(paymentAttempts)
          .set({
            lastErrorCode:
              sql`coalesce(${paymentAttempts.lastErrorCode}, 'RESTOCK_FAILED')` as any,
            lastErrorMessage:
              sql`coalesce(${paymentAttempts.lastErrorMessage}, ${issueMsg})` as any,
            updatedAt: now,
          })
          .where(eq(paymentAttempts.id, outcome.attemptId));
      }
    }
  }

  return {
    deduped,
    appliedResult,
    eventId,
    invoiceId: parsed.normalized.invoiceId,
  };
}

export async function handleMonobankWebhook(args: {
  rawBodyBytes: Uint8Array;
  parsedPayload: Record<string, unknown>;
  eventKey: string;
  requestId: string;
  mode: WebhookMode;
}) {
  const rawBodyBuffer = Buffer.isBuffer(args.rawBodyBytes)
    ? args.rawBodyBytes
    : Buffer.from(args.rawBodyBytes);
  const rawBody = rawBodyBuffer.toString('utf8');
  const rawSha256 = crypto
    .createHash('sha256')
    .update(rawBodyBuffer)
    .digest('hex');

  return applyMonoWebhookEvent({
    rawBody,
    parsedPayload: args.parsedPayload,
    eventKey: args.eventKey,
    rawSha256,
    requestId: args.requestId,
    mode: args.mode,
  });
}

