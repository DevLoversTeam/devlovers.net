import 'server-only';

import crypto from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import {
  MONO_DEDUP,
  MONO_MISMATCH,
  MONO_OLD_EVENT,
  MONO_PAID_APPLIED,
  MONO_STORE_MODE,
  MONO_WEBHOOK_ATOMIC_UPDATE_FAILED,
  MONO_WEBHOOK_RESTOCK_FAILED,
  MONO_WEBHOOK_UNKNOWN_STATUS,
  monoLogError,
  monoLogInfo,
  monoLogWarn,
} from '@/lib/logging/monobank';
import { InvalidPayloadError } from '@/lib/services/errors';
import { guardedPaymentStatusUpdate } from '@/lib/services/orders/payment-state';
import { restockOrder } from '@/lib/services/orders/restock';
import { isUuidV1toV5 } from '@/lib/utils/uuid';

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

type AttemptRow = Pick<
  typeof paymentAttempts.$inferSelect,
  | 'id'
  | 'orderId'
  | 'status'
  | 'expectedAmountMinor'
  | 'providerPaymentIntentId'
  | 'providerModifiedAt'
>;

type OrderRow = Pick<
  typeof orders.$inferSelect,
  | 'id'
  | 'paymentStatus'
  | 'paymentProvider'
  | 'status'
  | 'currency'
  | 'totalAmountMinor'
  | 'pspMetadata'
>;

type PaymentStatusTarget = Parameters<
  typeof guardedPaymentStatusUpdate
>[0]['to'];

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

function readDbRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as any;
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
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
  return reference && isUuidV1toV5(reference) ? reference : null;
}

async function fetchAttemptForWebhook(args: {
  invoiceId: string;
  referenceAttemptId: string | null;
}): Promise<AttemptRow | null> {
  const attemptRes = (await db.execute(sql`
    select
      id as "id",
      order_id as "orderId",
      status as "status",
      expected_amount_minor as "expectedAmountMinor",
      provider_payment_intent_id as "providerPaymentIntentId",
      provider_modified_at as "providerModifiedAt"
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
    select
      id as "id",
      payment_status as "paymentStatus",
      payment_provider as "paymentProvider",
      status as "status",
      currency as "currency",
      total_amount_minor as "totalAmountMinor",
      psp_metadata as "pspMetadata"
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
    (!attemptProviderModifiedAt ||
      providerModifiedAt > attemptProviderModifiedAt)
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

async function atomicMarkPaidOrderAndSucceedAttempt(args: {
  now: Date;
  orderId: string;
  attemptId: string;
  invoiceId: string;
  mergedMetaSql: ReturnType<typeof buildMergedMetaSql>;
  nextProviderModifiedAt: Date | null;
}): Promise<boolean> {
  const res = await db.execute(sql`
    with updated_order as (
      update orders
      set status = 'PAID',
          psp_charge_id = ${args.invoiceId},
          psp_metadata = ${args.mergedMetaSql},
          updated_at = ${args.now}
      where id = ${args.orderId}::uuid
        and payment_provider = 'monobank'
        and exists (
          select 1
          from payment_attempts
          where id = ${args.attemptId}::uuid
        )
      returning id
    ),
    updated_attempt as (
      update payment_attempts
      set status = 'succeeded',
          finalized_at = ${args.now},
          updated_at = ${args.now},
          last_error_code = null,
          last_error_message = null,
          provider_modified_at = ${args.nextProviderModifiedAt ?? null}
      where id = ${args.attemptId}::uuid
        and exists (select 1 from updated_order)
      returning id
    )
    select
      (select id from updated_order) as order_id,
      (select id from updated_attempt) as attempt_id
  `);

  const row = readDbRows<{ order_id?: string; attempt_id?: string }>(res)[0];
  return Boolean(row?.order_id && row?.attempt_id);
}

async function atomicFinalizeOrderAndAttempt(args: {
  now: Date;
  orderId: string;
  attemptId: string;
  pspStatusReason: string;
  mergedMetaSql: ReturnType<typeof buildMergedMetaSql>;
  attemptStatus: 'failed' | 'canceled';
  lastErrorCode: string;
  lastErrorMessage: string;
  nextProviderModifiedAt: Date | null;
}): Promise<boolean> {
  const res = await db.execute(sql`
    with updated_order as (
      update orders
      set psp_status_reason = ${args.pspStatusReason},
          psp_metadata = ${args.mergedMetaSql},
          updated_at = ${args.now}
      where id = ${args.orderId}::uuid
        and payment_provider = 'monobank'
        and exists (
          select 1
          from payment_attempts
          where id = ${args.attemptId}::uuid
        )
      returning id
    ),
    updated_attempt as (
      update payment_attempts
      set status = ${args.attemptStatus},
          finalized_at = ${args.now},
          updated_at = ${args.now},
          last_error_code = ${args.lastErrorCode},
          last_error_message = ${args.lastErrorMessage},
          provider_modified_at = ${args.nextProviderModifiedAt ?? null}
      where id = ${args.attemptId}::uuid
        and exists (select 1 from updated_order)
      returning id
    )
    select
      (select id from updated_order) as order_id,
      (select id from updated_attempt) as attempt_id
  `);

  const row = readDbRows<{ order_id?: string; attempt_id?: string }>(res)[0];
  return Boolean(row?.order_id && row?.attempt_id);
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
  const attemptProviderModifiedAt = attemptRow.providerModifiedAt
    ? new Date(attemptRow.providerModifiedAt)
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
    monoLogInfo(MONO_OLD_EVENT, {
      eventId,
      invoiceId: normalized.invoiceId,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
      status,
      reason: 'provider_modified_at_older_or_equal',
    });
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
    orderTotal: Number(orderRow.totalAmountMinor ?? 0),
    expectedAmount:
      attemptRow.expectedAmountMinor != null
        ? Number(attemptRow.expectedAmountMinor)
        : null,
  });

  if (mismatch.mismatch) {
    monoLogWarn(MONO_MISMATCH, {
      eventId,
      invoiceId: normalized.invoiceId,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
      status,
      reason: mismatch.reason ?? 'mismatch',
    });
    const appliedResult: ApplyResult = 'applied_with_issue';

    if (orderRow.paymentStatus !== 'paid') {
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
            failureMessage:
              mismatch.reason ?? 'Webhook amount/currency mismatch.',
            updatedAt: now,
          })
          .where(
            and(
              eq(orders.id, orderRow.id),
              eq(orders.paymentProvider, 'monobank' as any)
            )
          );
      } else {
        // transition blocked, appliedResult already 'applied_with_issue'
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
    orderRow.paymentStatus === 'paid' &&
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

  if (orderRow.paymentStatus === 'needs_review') {
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
    (orderRow.paymentStatus === 'failed' ||
      orderRow.paymentStatus === 'refunded') &&
    status === 'success'
  ) {
    const appliedResult: ApplyResult = 'applied_with_issue';

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
          failureMessage: `Out-of-order event: ${orderRow.paymentStatus} -> success`,
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, orderRow.id),
            eq(orders.paymentProvider, 'monobank' as any)
          )
        );
    } else {
      // transition blocked, appliedResult already 'applied_with_issue'
    }

    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      appliedErrorCode: 'OUT_OF_ORDER',
      appliedErrorMessage: `Out-of-order: ${orderRow.paymentStatus} -> success`,
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

    const ok = await atomicMarkPaidOrderAndSucceedAttempt({
      now,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
      invoiceId: normalized.invoiceId,
      mergedMetaSql,
      nextProviderModifiedAt: nextProviderModifiedAt ?? null,
    });

    if (!ok) {
      monoLogError(
        MONO_WEBHOOK_ATOMIC_UPDATE_FAILED,
        new Error('Atomic update (paid+succeeded) did not update both rows'),
        {
          eventId,
          orderId: orderRow.id,
          attemptId: attemptRow.id,
          status,
        }
      );

      const appliedResult: ApplyResult = 'applied_with_issue';
      await persistEventOutcome({
        eventId,
        now,
        appliedResult,
        appliedErrorCode: 'DB_WRITE_FAILED',
        appliedErrorMessage:
          'atomic update (paid+succeeded) did not update both rows',
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });

      return buildApplyOutcome({
        appliedResult,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });
    }

    const appliedResult: ApplyResult = 'applied';
    await persistEventOutcome({
      eventId,
      now,
      appliedResult,
      attemptId: attemptRow.id,
      orderId: orderRow.id,
    });
    monoLogInfo(MONO_PAID_APPLIED, {
      eventId,
      invoiceId: normalized.invoiceId,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
      status,
      appliedResult,
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

    const attemptStatus = isRefunded ? 'canceled' : 'failed';
    const lastErrorMessage = `Monobank status: ${status}`;

    const ok = await atomicFinalizeOrderAndAttempt({
      now,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
      pspStatusReason: status,
      mergedMetaSql,
      attemptStatus,
      lastErrorCode: status,
      lastErrorMessage,
      nextProviderModifiedAt: nextProviderModifiedAt ?? null,
    });

    if (!ok) {
      monoLogError(
        MONO_WEBHOOK_ATOMIC_UPDATE_FAILED,
        new Error('Atomic update (finalize) did not update both rows'),
        {
          eventId,
          orderId: orderRow.id,
          attemptId: attemptRow.id,
          status,
        }
      );

      const appliedResult: ApplyResult = 'applied_with_issue';
      await persistEventOutcome({
        eventId,
        now,
        appliedResult,
        appliedErrorCode: 'DB_WRITE_FAILED',
        appliedErrorMessage:
          'atomic update (finalize) did not update both rows',
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });

      return buildApplyOutcome({
        appliedResult,
        attemptId: attemptRow.id,
        orderId: orderRow.id,
      });
    }

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

  monoLogError(
    MONO_WEBHOOK_UNKNOWN_STATUS,
    new Error('Unrecognized Monobank status'),
    {
      eventId,
      status,
      invoiceId: normalized.invoiceId,
      orderId: orderRow.id,
      attemptId: attemptRow.id,
    }
  );

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

  const orderRow = await fetchOrderForAttempt(attemptRow.orderId);
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

async function finalizeOutcomeWithRestock(args: {
  eventId: string;
  requestId: string;
  normalized: NormalizedWebhook;
  outcome: MonobankApplyOutcome;
}): Promise<ApplyResult> {
  const { appliedResult, restockOrderId, restockReason } = args.outcome;

  if (restockReason && restockOrderId) {
    try {
      await restockOrder(restockOrderId, {
        reason: restockReason,
        workerId: 'monobank_webhook',
      });
    } catch (error) {
      monoLogError(MONO_WEBHOOK_RESTOCK_FAILED, error, {
        requestId: args.requestId,
        invoiceId: args.normalized.invoiceId,
      });
      const now = new Date();
      const issueMsg = toIssueMessage(error);

      await db
        .update(monobankEvents)
        .set({
          appliedResult: 'applied_with_issue',
          appliedErrorCode:
            sql`coalesce(${monobankEvents.appliedErrorCode}, 'RESTOCK_FAILED')` as any,
          appliedErrorMessage:
            sql`coalesce(${monobankEvents.appliedErrorMessage}, ${issueMsg})` as any,
        })
        .where(eq(monobankEvents.id, args.eventId));

      if (args.outcome.attemptId) {
        await db
          .update(paymentAttempts)
          .set({
            lastErrorCode:
              sql`coalesce(${paymentAttempts.lastErrorCode}, 'RESTOCK_FAILED')` as any,
            lastErrorMessage:
              sql`coalesce(${paymentAttempts.lastErrorMessage}, ${issueMsg})` as any,
            updatedAt: now,
          })
          .where(eq(paymentAttempts.id, args.outcome.attemptId));
      }
    }
  }

  return appliedResult;
}

export async function applyStoredMonobankEvent(args: {
  eventId: string;
  requestId: string;
  parsedPayload: Record<string, unknown>;
}): Promise<{
  appliedResult: ApplyResult;
  eventId: string;
  invoiceId: string;
}> {
  const parsed = normalizeWebhookPayload(args.parsedPayload);
  const outcome = await applyWebhookToOrderAttemptEvent({
    eventId: args.eventId,
    normalized: parsed.normalized,
    providerModifiedAt: parsed.providerModifiedAt,
  });

  const appliedResult = await finalizeOutcomeWithRestock({
    eventId: args.eventId,
    requestId: args.requestId,
    normalized: parsed.normalized,
    outcome,
  });

  return {
    appliedResult,
    eventId: args.eventId,
    invoiceId: parsed.normalized.invoiceId,
  };
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
    monoLogInfo(MONO_DEDUP, {
      requestId: args.requestId,
      invoiceId: parsed.normalized.invoiceId,
      status: parsed.normalized.status,
      deduped: true,
      reason: 'insert_conflict',
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
    monoLogInfo(MONO_STORE_MODE, {
      requestId: args.requestId,
      mode: args.mode,
      storeDecision: appliedResult,
      eventId,
      invoiceId: parsed.normalized.invoiceId,
    });

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
  const appliedResult = await finalizeOutcomeWithRestock({
    eventId,
    requestId: args.requestId,
    normalized: parsed.normalized,
    outcome,
  });

  return {
    deduped,
    appliedResult,
    eventId,
    invoiceId: parsed.normalized.invoiceId,
  };
}

export async function handleMonobankWebhook(args: {
  rawBodyBytes: Uint8Array;
  rawSha256: string;
  parsedPayload: Record<string, unknown>;
  eventKey: string;
  requestId: string;
  mode: WebhookMode;
}) {
  const rawBodyBuffer = Buffer.isBuffer(args.rawBodyBytes)
    ? args.rawBodyBytes
    : Buffer.from(args.rawBodyBytes);
  const rawBody = rawBodyBuffer.toString('utf8');

  return applyMonoWebhookEvent({
    rawBody,
    parsedPayload: args.parsedPayload,
    eventKey: args.eventKey,
    rawSha256: args.rawSha256,
    requestId: args.requestId,
    mode: args.mode,
  });
}
