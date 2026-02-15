import 'server-only';

import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { getMonobankConfig } from '@/lib/env/monobank';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { MONO_EXPIRED_RECONCILED, monoLogInfo } from '@/lib/logging/monobank';
import { getInvoiceStatus } from '@/lib/psp/monobank';
import {
  claimNextMonobankEvent,
  type MonobankEventRow,
} from '@/lib/services/orders/monobank-events-claim';
import {
  applyMonoWebhookEvent,
  applyStoredMonobankEvent,
} from '@/lib/services/orders/monobank-webhook';
import { restockOrder } from '@/lib/services/orders/restock';

const ACTIVE_MONOBANK_ATTEMPT_STATUSES = ['creating', 'active'] as const;
const STALE_CREATING_MONOBANK_ATTEMPT_STATUSES = ['creating'] as const;
const DEFAULT_JOB1_GRACE_SECONDS = 900;
const DEFAULT_JOB2_TTL_SECONDS = 120;
const DEFAULT_JANITOR_LEASE_SECONDS = 120;
const GRACE_SECONDS_MIN = 0;
const GRACE_SECONDS_MAX = 24 * 60 * 60;
const TTL_SECONDS_MIN = 0;
const TTL_SECONDS_MAX = 24 * 60 * 60;
const LEASE_SECONDS_MIN = 15;
const LEASE_SECONDS_MAX = 30 * 60;
const JOB2_ORDER_FAILURE_CODE = 'PSP_UNAVAILABLE';
const JOB2_ORDER_FAILURE_MESSAGE = 'Monobank invoice create failed.';
const JOB2_ATTEMPT_ERROR_CODE = 'invoice_missing';
const JOB2_ATTEMPT_ERROR_MESSAGE =
  'Active attempt missing invoice details (stale).';
const JOB3_EVENT_ERROR_CODE = 'JANITOR_JOB3_APPLY_FAILED';
const JOB3_MODE_MISMATCH_CODE = 'MONO_WEBHOOK_MODE_NOT_STORE';
const DEFAULT_JOB4_NEEDS_REVIEW_AGE_HOURS = 24;
const NEEDS_REVIEW_AGE_HOURS_MIN = 0;
const NEEDS_REVIEW_AGE_HOURS_MAX = 7 * 24;

type AttemptCandidateRow = {
  id: string;
  order_id: string;
  provider_payment_intent_id: string | null;
  status: string;
};

type Job2CandidateRow = {
  id: string;
  order_id: string;
};

type Job3CandidateRow = {
  id: string;
  invoice_id: string | null;
  attempt_id: string | null;
  provider_modified_at: unknown;
  received_at: unknown;
  raw_payload: unknown;
};

type Job4CandidateRow = {
  received_at: unknown;
  applied_error_code: string | null;
};

type JobRunArgs = {
  dryRun: boolean;
  limit: number;
  requestId: string;
  runId: string;
  baseMeta: Record<string, unknown>;
};

export type MonobankJanitorJob1Result = {
  processed: number;
  applied: number;
  noop: number;
  failed: number;
};

export type MonobankJanitorJob2Result = {
  processed: number;
  applied: number;
  noop: number;
  failed: number;
};

export type MonobankJanitorJob3Result = {
  processed: number;
  applied: number;
  noop: number;
  failed: number;
};

export type MonobankJanitorJob4Result = {
  processed: number;
  applied: number;
  noop: number;
  failed: number;
  report: {
    count: number;
    oldestAgeMinutes: number | null;
    topReasons?: Array<{ reason: string; count: number }>;
  };
};

export class MonobankJanitorJob3ModeError extends Error {
  readonly code = JOB3_MODE_MISMATCH_CODE;
  readonly status = 409;

  constructor(message = 'Monobank webhook mode must be store for job3') {
    super(message);
  }
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(n);
  return Math.max(min, Math.min(max, v));
}

function parseEnvInt(
  key: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : Number.NaN;
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return clampInt(base, min, max);
}

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as any;
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

function sha256Utf8(value: string): string {
  return crypto.createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex');
}

function buildApplyPayload(args: {
  invoiceId: string;
  status: string;
  raw?: Record<string, unknown>;
}): Record<string, unknown> {
  const base =
    args.raw && typeof args.raw === 'object' && !Array.isArray(args.raw)
      ? { ...args.raw }
      : {};
  return {
    ...base,
    invoiceId: args.invoiceId,
    status: args.status,
  };
}

function isAppliedResult(result: string): boolean {
  return result === 'applied' || result === 'applied_with_issue';
}

async function readDryRunCandidates(args: {
  limit: number;
  graceSeconds: number;
}): Promise<AttemptCandidateRow[]> {
  const res = await db.execute<AttemptCandidateRow>(sql`
    select
      pa.id,
      pa.order_id,
      pa.provider_payment_intent_id,
      pa.status
    from payment_attempts pa
    where pa.provider = 'monobank'
      and pa.status in ('creating', 'active')
      and pa.provider_payment_intent_id is not null
      and pa.updated_at < now() - make_interval(secs => ${args.graceSeconds})
      and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
    order by pa.updated_at asc
    limit ${args.limit}
  `);

  return readRows<AttemptCandidateRow>(res);
}

async function claimJob1Attempts(args: {
  limit: number;
  graceSeconds: number;
  leaseSeconds: number;
  runId: string;
}): Promise<AttemptCandidateRow[]> {
  const res = await db.execute<AttemptCandidateRow>(sql`
    with candidates as (
      select pa.id
      from payment_attempts pa
      where pa.provider = 'monobank'
        and pa.status in ('creating', 'active')
        and pa.provider_payment_intent_id is not null
        and pa.updated_at < now() - make_interval(secs => ${args.graceSeconds})
        and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
      order by pa.updated_at asc
      limit ${args.limit}
    ),
    claimed as (
      update payment_attempts pa
      set
        janitor_claimed_until = now() + make_interval(secs => ${args.leaseSeconds}),
        janitor_claimed_by = ${args.runId},
        updated_at = now()
      where pa.id in (select id from candidates)
        and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
      returning
        pa.id,
        pa.order_id,
        pa.provider_payment_intent_id,
        pa.status
    )
    select * from claimed
  `);

  return readRows<AttemptCandidateRow>(res);
}

async function releaseAttemptLease(args: { attemptId: string; runId: string }) {
  await db.execute(sql`
    update payment_attempts
    set
      janitor_claimed_until = null,
      janitor_claimed_by = null,
      updated_at = now()
    where id = ${args.attemptId}::uuid
      and janitor_claimed_by = ${args.runId}
  `);
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPayloadRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function job3GroupKey(row: Job3CandidateRow): string {
  const invoiceId =
    typeof row.invoice_id === 'string' ? row.invoice_id.trim() : '';
  if (invoiceId) return `invoice:${invoiceId}`;
  const attemptId =
    typeof row.attempt_id === 'string' ? row.attempt_id.trim() : '';
  if (attemptId) return `attempt:${attemptId}`;
  return `event:${row.id}`;
}

function compareJob3Rows(a: Job3CandidateRow, b: Job3CandidateRow): number {
  const aProviderModifiedAt = toDateOrNull(a.provider_modified_at);
  const bProviderModifiedAt = toDateOrNull(b.provider_modified_at);

  if (aProviderModifiedAt && bProviderModifiedAt) {
    const delta = aProviderModifiedAt.getTime() - bProviderModifiedAt.getTime();
    if (delta !== 0) return delta;
  } else if (aProviderModifiedAt && !bProviderModifiedAt) {
    return -1;
  } else if (!aProviderModifiedAt && bProviderModifiedAt) {
    return 1;
  }

  const aReceivedAt = toDateOrNull(a.received_at);
  const bReceivedAt = toDateOrNull(b.received_at);
  if (aReceivedAt && bReceivedAt) {
    const delta = aReceivedAt.getTime() - bReceivedAt.getTime();
    if (delta !== 0) return delta;
  }

  return a.id.localeCompare(b.id);
}

function sortJob3RowsByCanonicalOrder(rows: Job3CandidateRow[]): Job3CandidateRow[] {
  const groups = new Map<string, Job3CandidateRow[]>();

  for (const row of rows) {
    const key = job3GroupKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const sortedGroups = Array.from(groups.values()).map(group =>
    [...group].sort(compareJob3Rows)
  );
  sortedGroups.sort((a, b) => compareJob3Rows(a[0]!, b[0]!));

  return sortedGroups.flat();
}

async function readDryRunJob3Candidates(args: {
  limit: number;
}): Promise<Job3CandidateRow[]> {
  const res = await db.execute<Job3CandidateRow>(sql`
    select
      me.id,
      me.invoice_id,
      me.attempt_id,
      me.provider_modified_at,
      me.received_at,
      me.raw_payload
    from monobank_events me
    where me.provider = 'monobank'
      and me.applied_at is null
      and (me.claim_expires_at is null or me.claim_expires_at < now())
    order by
      me.provider_modified_at asc nulls last,
      me.received_at asc,
      me.id asc
    limit ${args.limit}
  `);

  return readRows<Job3CandidateRow>(res);
}

function toJob3CandidateRow(row: MonobankEventRow): Job3CandidateRow {
  return {
    id: row.id,
    invoice_id:
      typeof row.invoice_id === 'string' ? row.invoice_id : row.invoice_id ?? null,
    attempt_id:
      typeof row.attempt_id === 'string' ? row.attempt_id : row.attempt_id ?? null,
    provider_modified_at: row.provider_modified_at,
    received_at: row.received_at,
    raw_payload: row.raw_payload,
  };
}

async function claimJob3Events(args: {
  limit: number;
  runId: string;
}): Promise<Job3CandidateRow[]> {
  const claimed: Job3CandidateRow[] = [];

  for (let i = 0; i < args.limit; i += 1) {
    const next = await claimNextMonobankEvent(args.runId);
    if (!next) break;
    claimed.push(toJob3CandidateRow(next));
  }

  return claimed;
}

async function markJob3EventFailed(args: {
  eventId: string;
  runId: string;
  error: unknown;
}) {
  const errorMessage =
    args.error instanceof Error ? args.error.message : String(args.error);
  await db.execute(sql`
    update monobank_events
    set applied_at = now(),
        applied_result = 'applied_with_issue',
        applied_error_code = coalesce(applied_error_code, ${JOB3_EVENT_ERROR_CODE}),
        applied_error_message = coalesce(applied_error_message, ${errorMessage})
    where id = ${args.eventId}::uuid
      and claimed_by = ${args.runId}
      and applied_at is null
  `);
}

async function releaseEventLease(args: { eventId: string; runId: string }) {
  await db.execute(sql`
    update monobank_events
    set claimed_at = null,
        claim_expires_at = null,
        claimed_by = null
    where id = ${args.eventId}::uuid
      and claimed_by = ${args.runId}
  `);
}

async function readNeedsReviewCandidates(args: {
  limit: number;
  ageHoursThreshold: number;
}): Promise<Job4CandidateRow[]> {
  const res = await db.execute<Job4CandidateRow>(sql`
    select
      me.received_at,
      me.applied_error_code
    from monobank_events me
    where me.provider = 'monobank'
      and me.status = 'needs_review'
      and me.received_at < now() - make_interval(hours => ${args.ageHoursThreshold})
    order by me.received_at asc
    limit ${args.limit}
  `);

  return readRows<Job4CandidateRow>(res);
}

function buildNeedsReviewTopReasons(rows: Job4CandidateRow[]): Array<{
  reason: string;
  count: number;
}> {
  const reasonCounter = new Map<string, number>();

  for (const row of rows) {
    const reason = (row.applied_error_code ?? '').trim();
    if (!reason) continue;
    reasonCounter.set(reason, (reasonCounter.get(reason) ?? 0) + 1);
  }

  return Array.from(reasonCounter.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 3);
}

async function readDryRunJob2Candidates(args: {
  limit: number;
  ttlSeconds: number;
}): Promise<Job2CandidateRow[]> {
  const res = await db.execute<Job2CandidateRow>(sql`
    select
      pa.id,
      pa.order_id
    from payment_attempts pa
    where pa.provider = 'monobank'
      and pa.status = 'creating'
      and pa.provider_payment_intent_id is null
      and pa.created_at < now() - make_interval(secs => ${args.ttlSeconds})
      and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
      and exists (
        select 1
        from orders o
        where o.id = pa.order_id
          and o.payment_provider = 'monobank'
          and o.payment_status in ('pending', 'requires_payment')
          and o.status not in ('PAID', 'CANCELED')
      )
    order by pa.created_at asc
    limit ${args.limit}
  `);

  return readRows<Job2CandidateRow>(res);
}

async function claimJob2Attempts(args: {
  limit: number;
  ttlSeconds: number;
  leaseSeconds: number;
  runId: string;
}): Promise<Job2CandidateRow[]> {
  const res = await db.execute<Job2CandidateRow>(sql`
    with candidates as (
      select pa.id
      from payment_attempts pa
      where pa.provider = 'monobank'
        and pa.status = 'creating'
        and pa.provider_payment_intent_id is null
        and pa.created_at < now() - make_interval(secs => ${args.ttlSeconds})
        and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
        and exists (
          select 1
          from orders o
          where o.id = pa.order_id
            and o.payment_provider = 'monobank'
            and o.payment_status in ('pending', 'requires_payment')
            and o.status not in ('PAID', 'CANCELED')
        )
      order by pa.created_at asc
      limit ${args.limit}
    ),
    claimed as (
      update payment_attempts pa
      set
        janitor_claimed_until = now() + make_interval(secs => ${args.leaseSeconds}),
        janitor_claimed_by = ${args.runId},
        updated_at = now()
      where pa.id in (select id from candidates)
        and (pa.janitor_claimed_until is null or pa.janitor_claimed_until < now())
      returning
        pa.id,
        pa.order_id
    )
    select * from claimed
  `);

  return readRows<Job2CandidateRow>(res);
}

async function atomicCancelOrderAndFailCreatingAttempt(args: {
  attemptId: string;
  runId: string;
  ttlSeconds: number;
  now: Date;
}): Promise<string | null> {
  const res = await db.execute(sql`
    with updated_order as (
      update orders o
      set status = 'CANCELED',
          failure_code = coalesce(o.failure_code, ${JOB2_ORDER_FAILURE_CODE}),
          failure_message = coalesce(
            o.failure_message,
            ${JOB2_ORDER_FAILURE_MESSAGE}
          ),
          updated_at = ${args.now}
      from payment_attempts pa
      where pa.id = ${args.attemptId}::uuid
        and pa.order_id = o.id
        and pa.provider = 'monobank'
        and pa.status = 'creating'
        and pa.provider_payment_intent_id is null
        and pa.created_at < now() - make_interval(secs => ${args.ttlSeconds})
        and pa.janitor_claimed_by = ${args.runId}
        and o.payment_provider = 'monobank'
        and o.payment_status in ('pending', 'requires_payment')
        and o.status not in ('PAID', 'CANCELED')
      returning o.id
    ),
    updated_attempt as (
      update payment_attempts pa
      set status = 'failed',
          finalized_at = ${args.now},
          updated_at = ${args.now},
          last_error_code = ${JOB2_ATTEMPT_ERROR_CODE},
          last_error_message = ${JOB2_ATTEMPT_ERROR_MESSAGE}
      where pa.id = ${args.attemptId}::uuid
        and pa.status = 'creating'
        and pa.provider = 'monobank'
        and pa.provider_payment_intent_id is null
        and pa.janitor_claimed_by = ${args.runId}
        and exists (select 1 from updated_order)
      returning pa.id
    )
    select
      (select id from updated_order) as order_id,
      (select id from updated_attempt) as attempt_id
  `);

  const row = readRows<{ order_id?: string; attempt_id?: string }>(res)[0];
  if (!row?.order_id || !row?.attempt_id) return null;
  return row.order_id;
}

export async function runMonobankJanitorJob1(
  args: JobRunArgs
): Promise<MonobankJanitorJob1Result> {
  const graceSeconds = parseEnvInt(
    'MONO_JANITOR_JOB1_GRACE_SECONDS',
    DEFAULT_JOB1_GRACE_SECONDS,
    GRACE_SECONDS_MIN,
    GRACE_SECONDS_MAX
  );
  const leaseSeconds = parseEnvInt(
    'MONO_JANITOR_LEASE_SECONDS',
    DEFAULT_JANITOR_LEASE_SECONDS,
    LEASE_SECONDS_MIN,
    LEASE_SECONDS_MAX
  );

  if (args.dryRun) {
    const candidates = await readDryRunCandidates({
      limit: args.limit,
      graceSeconds,
    });

    logInfo('internal_monobank_janitor_job1_dry_run', {
      ...args.baseMeta,
      code: 'JANITOR_JOB1_DRY_RUN',
      runId: args.runId,
      dryRun: true,
      limit: args.limit,
      graceSeconds,
      leaseSeconds,
      activeStatuses: ACTIVE_MONOBANK_ATTEMPT_STATUSES,
      candidates: candidates.length,
    });

    return {
      processed: candidates.length,
      applied: 0,
      noop: 0,
      failed: 0,
    };
  }

  const claimed = await claimJob1Attempts({
    limit: args.limit,
    graceSeconds,
    leaseSeconds,
    runId: args.runId,
  });

  let processed = 0;
  let applied = 0;
  let noop = 0;
  let failed = 0;

  for (const attempt of claimed) {
    processed += 1;
    const invoiceId = (attempt.provider_payment_intent_id ?? '').trim();
    if (!invoiceId) {
      failed += 1;
      logWarn('internal_monobank_janitor_job1_missing_invoice_id', {
        ...args.baseMeta,
        code: 'JANITOR_JOB1_MISSING_INVOICE_ID',
        runId: args.runId,
        attemptId: attempt.id,
        orderId: attempt.order_id,
      });
      await releaseAttemptLease({ attemptId: attempt.id, runId: args.runId });
      continue;
    }

    try {
      const invoice = await getInvoiceStatus(invoiceId);
      const payload = buildApplyPayload({
        invoiceId: invoice.invoiceId,
        status: invoice.status,
        raw: invoice.raw,
      });
      const rawBody = JSON.stringify(payload);
      const rawSha256 = sha256Utf8(rawBody);

      const appliedResult = await applyMonoWebhookEvent({
        rawBody,
        parsedPayload: payload,
        rawSha256,
        eventKey: rawSha256,
        requestId: args.requestId,
        mode: 'apply',
      });

      if (isAppliedResult(appliedResult.appliedResult)) {
        applied += 1;
        monoLogInfo(MONO_EXPIRED_RECONCILED, {
          requestId: args.requestId,
          runId: args.runId,
          job: 'job1',
          orderId: attempt.order_id,
          attemptId: attempt.id,
          invoiceId,
          appliedResult: appliedResult.appliedResult,
          reason: 'stale_attempt_reconciled_from_psp_status',
        });
      } else {
        noop += 1;
      }
    } catch (error) {
      failed += 1;
      logError('internal_monobank_janitor_job1_attempt_failed', error, {
        ...args.baseMeta,
        code: 'JANITOR_JOB1_ATTEMPT_FAILED',
        runId: args.runId,
        attemptId: attempt.id,
        orderId: attempt.order_id,
      });
    } finally {
      try {
        await releaseAttemptLease({ attemptId: attempt.id, runId: args.runId });
      } catch (releaseError) {
        logWarn('internal_monobank_janitor_job1_release_failed', {
          ...args.baseMeta,
          code: 'JANITOR_JOB1_RELEASE_FAILED',
          runId: args.runId,
          attemptId: attempt.id,
          orderId: attempt.order_id,
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        });
      }
    }
  }

  logInfo('internal_monobank_janitor_job1_completed', {
    ...args.baseMeta,
    code: 'JANITOR_JOB1_COMPLETED',
    runId: args.runId,
    dryRun: false,
    limit: args.limit,
    graceSeconds,
    leaseSeconds,
    activeStatuses: ACTIVE_MONOBANK_ATTEMPT_STATUSES,
    claimed: claimed.length,
    processed,
    applied,
    noop,
    failed,
  });

  return {
    processed,
    applied,
    noop,
    failed,
  };
}

export async function runMonobankJanitorJob2(
  args: JobRunArgs
): Promise<MonobankJanitorJob2Result> {
  const ttlSeconds = parseEnvInt(
    'MONO_JANITOR_JOB2_TTL_SECONDS',
    DEFAULT_JOB2_TTL_SECONDS,
    TTL_SECONDS_MIN,
    TTL_SECONDS_MAX
  );
  const leaseSeconds = parseEnvInt(
    'MONO_JANITOR_LEASE_SECONDS',
    DEFAULT_JANITOR_LEASE_SECONDS,
    LEASE_SECONDS_MIN,
    LEASE_SECONDS_MAX
  );

  if (args.dryRun) {
    const candidates = await readDryRunJob2Candidates({
      limit: args.limit,
      ttlSeconds,
    });

    logInfo('internal_monobank_janitor_job2_dry_run', {
      ...args.baseMeta,
      code: 'JANITOR_JOB2_DRY_RUN',
      runId: args.runId,
      dryRun: true,
      limit: args.limit,
      ttlSeconds,
      leaseSeconds,
      targetStatuses: STALE_CREATING_MONOBANK_ATTEMPT_STATUSES,
      candidates: candidates.length,
    });

    return {
      processed: candidates.length,
      applied: 0,
      noop: 0,
      failed: 0,
    };
  }

  const claimed = await claimJob2Attempts({
    limit: args.limit,
    ttlSeconds,
    leaseSeconds,
    runId: args.runId,
  });

  let processed = 0;
  let applied = 0;
  let noop = 0;
  let failed = 0;

  for (const attempt of claimed) {
    processed += 1;

    try {
      const transitionedOrderId = await atomicCancelOrderAndFailCreatingAttempt({
        attemptId: attempt.id,
        runId: args.runId,
        ttlSeconds,
        now: new Date(),
      });

      if (!transitionedOrderId) {
        noop += 1;
        continue;
      }

      await restockOrder(transitionedOrderId, {
        reason: 'canceled',
        workerId: 'monobank',
      });

      applied += 1;
      monoLogInfo(MONO_EXPIRED_RECONCILED, {
        requestId: args.requestId,
        runId: args.runId,
        job: 'job2',
        orderId: transitionedOrderId,
        attemptId: attempt.id,
        appliedResult: 'applied',
        reason: 'expired_creating_attempt_canceled',
      });
    } catch (error) {
      failed += 1;
      logError('internal_monobank_janitor_job2_attempt_failed', error, {
        ...args.baseMeta,
        code: 'JANITOR_JOB2_ATTEMPT_FAILED',
        runId: args.runId,
        attemptId: attempt.id,
        orderId: attempt.order_id,
      });
    } finally {
      try {
        await releaseAttemptLease({ attemptId: attempt.id, runId: args.runId });
      } catch (releaseError) {
        logWarn('internal_monobank_janitor_job2_release_failed', {
          ...args.baseMeta,
          code: 'JANITOR_JOB2_RELEASE_FAILED',
          runId: args.runId,
          attemptId: attempt.id,
          orderId: attempt.order_id,
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        });
      }
    }
  }

  logInfo('internal_monobank_janitor_job2_completed', {
    ...args.baseMeta,
    code: 'JANITOR_JOB2_COMPLETED',
    runId: args.runId,
    dryRun: false,
    limit: args.limit,
    ttlSeconds,
    leaseSeconds,
    targetStatuses: STALE_CREATING_MONOBANK_ATTEMPT_STATUSES,
    claimed: claimed.length,
    processed,
    applied,
    noop,
    failed,
  });

  return {
    processed,
    applied,
    noop,
    failed,
  };
}

export async function runMonobankJanitorJob3(
  args: JobRunArgs
): Promise<MonobankJanitorJob3Result> {
  const webhookMode = getMonobankConfig().webhookMode;
  if (webhookMode !== 'store') {
    throw new MonobankJanitorJob3ModeError();
  }

  if (args.dryRun) {
    const candidates = await readDryRunJob3Candidates({
      limit: args.limit,
    });

    logInfo('internal_monobank_janitor_job3_dry_run', {
      ...args.baseMeta,
      code: 'JANITOR_JOB3_DRY_RUN',
      runId: args.runId,
      dryRun: true,
      limit: args.limit,
      candidates: candidates.length,
    });

    return {
      processed: candidates.length,
      applied: 0,
      noop: 0,
      failed: 0,
    };
  }

  const claimed = await claimJob3Events({
    limit: args.limit,
    runId: args.runId,
  });
  const ordered = sortJob3RowsByCanonicalOrder(claimed);

  let processed = 0;
  let applied = 0;
  let noop = 0;
  let failed = 0;

  for (const eventRow of ordered) {
    processed += 1;

    try {
      const parsedPayload = toPayloadRecord(eventRow.raw_payload);
      if (!parsedPayload) {
        throw new Error('Stored event has invalid raw payload');
      }

      const result = await applyStoredMonobankEvent({
        eventId: eventRow.id,
        requestId: args.requestId,
        parsedPayload,
      });

      if (isAppliedResult(result.appliedResult)) {
        applied += 1;
      } else {
        noop += 1;
      }
    } catch (error) {
      failed += 1;
      logError('internal_monobank_janitor_job3_event_failed', error, {
        ...args.baseMeta,
        code: 'JANITOR_JOB3_EVENT_FAILED',
        runId: args.runId,
        eventId: eventRow.id,
        invoiceId: eventRow.invoice_id,
        attemptId: eventRow.attempt_id,
      });

      try {
        await markJob3EventFailed({
          eventId: eventRow.id,
          runId: args.runId,
          error,
        });
      } catch (markError) {
        logWarn('internal_monobank_janitor_job3_mark_failed_failed', {
          ...args.baseMeta,
          code: 'JANITOR_JOB3_MARK_FAILED_FAILED',
          runId: args.runId,
          eventId: eventRow.id,
          error:
            markError instanceof Error ? markError.message : String(markError),
        });
      }
    } finally {
      try {
        await releaseEventLease({ eventId: eventRow.id, runId: args.runId });
      } catch (releaseError) {
        logWarn('internal_monobank_janitor_job3_release_failed', {
          ...args.baseMeta,
          code: 'JANITOR_JOB3_RELEASE_FAILED',
          runId: args.runId,
          eventId: eventRow.id,
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        });
      }
    }
  }

  logInfo('internal_monobank_janitor_job3_completed', {
    ...args.baseMeta,
    code: 'JANITOR_JOB3_COMPLETED',
    runId: args.runId,
    dryRun: false,
    limit: args.limit,
    claimed: claimed.length,
    processed,
    applied,
    noop,
    failed,
  });

  return {
    processed,
    applied,
    noop,
    failed,
  };
}

export async function runMonobankJanitorJob4(
  args: JobRunArgs
): Promise<MonobankJanitorJob4Result> {
  const ageHoursThreshold = parseEnvInt(
    'MONO_JANITOR_JOB4_NEEDS_REVIEW_AGE_HOURS',
    DEFAULT_JOB4_NEEDS_REVIEW_AGE_HOURS,
    NEEDS_REVIEW_AGE_HOURS_MIN,
    NEEDS_REVIEW_AGE_HOURS_MAX
  );

  const candidates = await readNeedsReviewCandidates({
    limit: args.limit,
    ageHoursThreshold,
  });

  const oldestReceivedAt = toDateOrNull(candidates[0]?.received_at ?? null);
  const nowMs = Date.now();
  const oldestAgeMinutes = oldestReceivedAt
    ? Math.max(0, Math.floor((nowMs - oldestReceivedAt.getTime()) / 60_000))
    : null;

  const topReasons = buildNeedsReviewTopReasons(candidates);
  const report: MonobankJanitorJob4Result['report'] = {
    count: candidates.length,
    oldestAgeMinutes,
    ...(topReasons.length > 0 ? { topReasons } : {}),
  };

  logInfo('internal_monobank_janitor_job4_needs_review_report', {
    ...args.baseMeta,
    code: 'NEEDS_REVIEW_REPORT',
    provider: 'monobank',
    count: report.count,
    oldestAgeMinutes: report.oldestAgeMinutes,
    limit: args.limit,
    ageHoursThreshold,
  });

  return {
    processed: 0,
    applied: 0,
    noop: 0,
    failed: 0,
    report,
  };
}
