import 'server-only';

import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { logError, logInfo } from '@/lib/logging';
import { restockOrder } from '@/lib/services/orders/restock';
import { InvalidPayloadError } from '@/lib/services/errors';
import { __paymentTransitions } from '@/lib/services/orders/payment-state';

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
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function normalizeStatus(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

function parseWebhookPayload(rawBody: string): {
  raw: Record<string, unknown>;
  normalized: NormalizedWebhook;
  providerEventId: string | null;
  eventTimeBucket: number | null;
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

  const providerEventId =
    typeof raw.eventId === 'string'
      ? raw.eventId
      : typeof raw.event_id === 'string'
        ? raw.event_id
        : typeof raw.id === 'string'
          ? raw.id
          : null;

  const eventTimeBucket = extractEventTimeBucket(raw);
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
    providerEventId,
    eventTimeBucket,
    providerModifiedAt,
  };
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: values under 1e11 are likely seconds, otherwise ms.
    const ms = value < 1e11 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function extractEventTimeBucket(raw: Record<string, unknown>): number | null {
  const candidates = [
    raw.createdDate,
    raw.createdAt,
    raw.modifiedDate,
    raw.modifiedAt,
    raw.updatedAt,
    raw.time,
    raw.timestamp,
  ];

  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms !== null) {
      return Math.floor(ms / 60000);
    }
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

function buildEventKey(args: {
  providerEventId: string | null;
  normalized: NormalizedWebhook;
  eventTimeBucket: number | null;
}): string {
  if (args.providerEventId && args.providerEventId.trim()) {
    return `mono:${args.providerEventId.trim()}`;
  }

  const base = {
    invoiceId: args.normalized.invoiceId,
    status: args.normalized.status,
    amount: args.normalized.amount ?? null,
    ccy: args.normalized.ccy ?? null,
    reference: args.normalized.reference ?? null,
    timeBucket: args.eventTimeBucket ?? null,
  };

  const normalizedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(base))
    .digest('hex')
    .slice(0, 16);

  return `mono:${base.invoiceId}:${base.status}:${normalizedHash}`;
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

export async function applyMonoWebhookEvent(args: {
  rawBody: string;
  requestId: string;
  mode: WebhookMode;
}): Promise<{
  deduped: boolean;
  appliedResult: ApplyResult;
  eventId: string | null;
  invoiceId: string;
}> {
  const parsed = parseWebhookPayload(args.rawBody);
  const rawSha256 = crypto
    .createHash('sha256')
    .update(args.rawBody)
    .digest('hex');
  const eventKey = buildEventKey({
    providerEventId: parsed.providerEventId,
    normalized: parsed.normalized,
    eventTimeBucket: parsed.eventTimeBucket,
  });

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

  if (args.mode === 'drop' || args.mode === 'store') {
    const appliedResult = args.mode === 'drop' ? 'dropped' : 'stored';
    await db
      .update(monobankEvents)
      .set({
        appliedAt: new Date(),
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

  const { appliedResult, restockOrderId, restockReason } =
    await (async (): Promise<MonobankApplyOutcome> => {
      // neon-http driver: no db.transaction() support
      const tx = db;
      let restockReason: 'failed' | 'refunded' | null = null;
      let restockOrderId: string | null = null;
      let appliedResult: ApplyResult = 'applied';

      const now = new Date();

      // 1) Find attempt (prefer reference UUID if provided) + lock
      const referenceAttemptId =
        parsed.normalized.reference && UUID_RE.test(parsed.normalized.reference)
          ? parsed.normalized.reference
          : null;

      const attemptRes = (await tx.execute(sql`
        select id, order_id, status, expected_amount_minor, provider_payment_intent_id, provider_modified_at
        from payment_attempts
        where provider = 'monobank'
          and (
            (${referenceAttemptId}::uuid is not null and id = ${referenceAttemptId}::uuid)
            or provider_payment_intent_id = ${parsed.normalized.invoiceId}
          )
        order by case
          when (${referenceAttemptId}::uuid is not null and id = ${referenceAttemptId}::uuid) then 1
          else 0
        end desc
        limit 1
      `)) as unknown as { rows?: Array<any> };

      const attemptRow = attemptRes.rows?.[0] as
        | {
            id: string;
            order_id: string;
            status: string;
            expected_amount_minor: number | null;
            provider_payment_intent_id: string | null;
            provider_modified_at: Date | string | null;
          }
        | undefined;

      if (!attemptRow) {
        appliedResult = 'unmatched';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'ATTEMPT_NOT_FOUND',
            appliedErrorMessage: 'No matching payment attempt',
          })
          .where(eq(monobankEvents.id, eventId));
        return { appliedResult, restockReason, restockOrderId };
      }

      // 2) Load order + lock
      const orderRes = (await tx.execute(sql`
        select id, payment_status, payment_provider, status, currency, total_amount_minor, psp_metadata
        from orders
        where id = ${attemptRow.order_id}::uuid
        limit 1
      `)) as unknown as { rows?: Array<any> };

      const orderRow = orderRes.rows?.[0] as
        | {
            id: string;
            payment_status: string;
            payment_provider: string;
            status: string;
            currency: string;
            total_amount_minor: number;
            psp_metadata: Record<string, unknown> | null;
          }
        | undefined;

      if (!orderRow) {
        appliedResult = 'unmatched';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'ORDER_NOT_FOUND',
            appliedErrorMessage: 'Order not found for attempt',
            attemptId: attemptRow.id,
          })
          .where(eq(monobankEvents.id, eventId));
        return { appliedResult, restockReason, restockOrderId };
      }

      const status = parsed.normalized.status;
      const providerModifiedAt = parsed.providerModifiedAt;
      const attemptProviderModifiedAt = attemptRow.provider_modified_at
        ? new Date(attemptRow.provider_modified_at)
        : null;
      const nextProviderModifiedAt =
        providerModifiedAt &&
        (!attemptProviderModifiedAt ||
          providerModifiedAt > attemptProviderModifiedAt)
          ? providerModifiedAt
          : attemptProviderModifiedAt;

      // Ordering guard (providerModifiedAt monotonic)
      if (
        providerModifiedAt &&
        attemptProviderModifiedAt &&
        providerModifiedAt <= attemptProviderModifiedAt
      ) {
        appliedResult = 'applied_noop';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'OUT_OF_ORDER',
            appliedErrorMessage: 'provider_modified_at older than latest',
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));
        return { appliedResult, restockReason, restockOrderId };
      }

      const mismatch = amountMismatch({
        payloadAmount: parsed.normalized.amount,
        payloadCcy: parsed.normalized.ccy,
        orderCurrency: orderRow.currency,
        orderTotal: Number(orderRow.total_amount_minor ?? 0),
        expectedAmount:
          attemptRow.expected_amount_minor != null
            ? Number(attemptRow.expected_amount_minor)
            : null,
      });

      const metadataPatch = {
        monobank: {
          invoiceId: parsed.normalized.invoiceId,
          status,
          amount: parsed.normalized.amount ?? null,
          ccy: parsed.normalized.ccy ?? null,
          reference: parsed.normalized.reference ?? null,
        },
      };

      const mergedMetaSql = sql`coalesce(${orders.pspMetadata}, '{}'::jsonb) || ${JSON.stringify(
        metadataPatch
      )}::jsonb`;

      const applyOrderPaymentStatusTx = async (input: {
        to: string;
        set?: Record<string, unknown>;
      }): Promise<{ applied: boolean; reason?: string }> => {
        if (orderRow.payment_provider !== 'monobank') {
          return { applied: false, reason: 'PROVIDER_MISMATCH' };
        }

        const hasSet = Boolean(input.set && Object.keys(input.set).length > 0);
        if (
          orderRow.payment_status !== input.to &&
          !__paymentTransitions.isAllowed(
            'monobank' as any,
            orderRow.payment_status as any,
            input.to as any
          )
        ) {
          return { applied: false, reason: 'INVALID_TRANSITION' };
        }

        if (orderRow.payment_status === input.to && !hasSet) {
          return { applied: false, reason: 'ALREADY_IN_STATE' };
        }

        const updated = await tx
          .update(orders)
          .set({
            ...(input.set ?? {}),
            paymentStatus: input.to as any,
          })
          .where(
            and(
              eq(orders.id, orderRow.id),
              eq(orders.paymentProvider, 'monobank' as any)
            )
          )
          .returning({ id: orders.id });

        return updated.length > 0
          ? { applied: true }
          : { applied: false, reason: 'BLOCKED' };
      };

      // 3) Amount/currency mismatch -> needs_review (never paid)
      if (mismatch.mismatch) {
        appliedResult = 'applied_with_issue';

        if (orderRow.payment_status !== 'paid') {
          await tx
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

          await applyOrderPaymentStatusTx({
            to: 'needs_review',
            set: {
              failureCode: 'MONO_AMOUNT_MISMATCH',
              failureMessage:
                mismatch.reason ?? 'Webhook amount/currency mismatch.',
              updatedAt: now,
            },
          });
        }

        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'AMOUNT_MISMATCH',
            appliedErrorMessage: mismatch.reason ?? 'Mismatch',
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult, restockReason, restockOrderId };
      }

      // 4) Paid is terminal: any later non-success => noop
      if (orderRow.payment_status === 'paid' && status !== 'success') {
        appliedResult = 'applied_noop';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult, restockReason, restockOrderId };
      }

      // 5) Once needs_review -> don't auto-flip anymore
      if (orderRow.payment_status === 'needs_review') {
        appliedResult = 'applied_noop';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult, restockReason, restockOrderId };
      }

      // 6) Out-of-order: failed/refunded -> success => needs_review
      if (
        (orderRow.payment_status === 'failed' ||
          orderRow.payment_status === 'refunded') &&
        status === 'success'
      ) {
        appliedResult = 'applied_with_issue';

        await applyOrderPaymentStatusTx({
          to: 'needs_review',
          set: {
            failureCode: 'MONO_OUT_OF_ORDER',
            failureMessage: `Out-of-order event: ${orderRow.payment_status} -> success`,
            updatedAt: now,
          },
        });

        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'OUT_OF_ORDER',
            appliedErrorMessage: `Out-of-order: ${orderRow.payment_status} -> success`,
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult, restockReason, restockOrderId };
      }

      // 7) Success
      if (status === 'success') {
        const paidRes = await applyOrderPaymentStatusTx({
          to: 'paid',
          set: {
            status: 'PAID',
            pspChargeId: parsed.normalized.invoiceId,
            pspMetadata: mergedMetaSql as any,
            updatedAt: now,
          },
        });

        if (!paidRes.applied) {
          appliedResult = 'applied_with_issue';
          await tx
            .update(monobankEvents)
            .set({
              appliedAt: now,
              appliedResult,
              appliedErrorCode: 'PAYMENT_STATE_BLOCKED',
              appliedErrorMessage: `blocked transition to paid (${paidRes.reason})`,
              attemptId: attemptRow.id,
              orderId: orderRow.id,
            })
            .where(eq(monobankEvents.id, eventId));

          return { appliedResult, restockReason, restockOrderId };
        }

        await tx
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

        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult: 'applied',
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult: 'applied', restockReason, restockOrderId };
      }

      // 8) Processing/created => noop
      if (status === 'processing' || status === 'created') {
        appliedResult = 'applied_noop';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        return { appliedResult, restockReason, restockOrderId };
      }

      // 9) Failure/expired/reversed
      if (
        status === 'failure' ||
        status === 'expired' ||
        status === 'reversed'
      ) {
        const isRefunded = status === 'reversed';
        const nextPaymentStatus = isRefunded ? 'refunded' : 'failed';

        const res = await applyOrderPaymentStatusTx({
          to: nextPaymentStatus,
          set: {
            pspStatusReason: status,
            pspMetadata: mergedMetaSql as any,
            updatedAt: now,
          },
        });

        if (!res.applied) {
          appliedResult = 'applied_with_issue';
          await tx
            .update(monobankEvents)
            .set({
              appliedAt: now,
              appliedResult,
              appliedErrorCode: 'PAYMENT_STATE_BLOCKED',
              appliedErrorMessage: `blocked transition to ${nextPaymentStatus} (${res.reason})`,
              attemptId: attemptRow.id,
              orderId: orderRow.id,
            })
            .where(eq(monobankEvents.id, eventId));

          return { appliedResult, restockReason, restockOrderId };
        }

        await tx
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

        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult: 'applied',
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));

        restockReason = isRefunded ? 'refunded' : 'failed';
        restockOrderId = orderRow.id;

        appliedResult = 'applied';
      } else {
        appliedResult = 'applied_with_issue';
        await tx
          .update(monobankEvents)
          .set({
            appliedAt: now,
            appliedResult,
            appliedErrorCode: 'UNKNOWN_STATUS',
            appliedErrorMessage: `Unknown status: ${status}`,
            attemptId: attemptRow.id,
            orderId: orderRow.id,
          })
          .where(eq(monobankEvents.id, eventId));
      }

      return { appliedResult, restockReason, restockOrderId };
    })();

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
    }
  }

  return {
    deduped,
    appliedResult,
    eventId,
    invoiceId: parsed.normalized.invoiceId,
  };
}
