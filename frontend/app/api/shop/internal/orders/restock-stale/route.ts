import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  restockStalePendingOrders,
  restockStaleNoPaymentOrders,
  restockStuckReservingOrders,
} from '@/lib/services/orders';
import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { guardNonBrowserOnly } from '@/lib/security/origin';

export const runtime = 'nodejs';

type OlderThanPolicy = {
  stuckReserving: number;
  stalePending: number;
  orphanNoPayment: number;
};

type SweepPolicy = {
  batchSize: number;
  olderThanMinutes: OlderThanPolicy;
};

const DEFAULT_POLICY: SweepPolicy = {
  batchSize: 50,
  olderThanMinutes: {
    stuckReserving: 15,
    stalePending: 60,
    orphanNoPayment: 30,
  },
};

const BATCH_MIN = 25;
const BATCH_MAX = 100;

const MIN_MINUTES = 10;
const MAX_MINUTES = 60 * 24 * 7;

const DEFAULT_MAX_RUNTIME_MS = 20_000;
const MAX_RUNTIME_MIN_MS = 1_000;
const MAX_RUNTIME_MAX_MS = 25_000;

const DEFAULT_REQUESTED_MIN_INTERVAL_SECONDS = 1;
const MIN_INTERVAL_SECONDS_MIN = 1;
const MIN_INTERVAL_SECONDS_MAX = 60 * 60;

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(n);
  return Math.max(min, Math.min(max, v));
}

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : typeof x === 'number' ? x : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseBatchSize(
  req: NextRequest,
  body: unknown
): number | { error: string } {
  const q = req.nextUrl.searchParams.get('batchSize');
  let candidate: unknown = q;

  if (
    (candidate === null || candidate === undefined) &&
    body &&
    typeof body === 'object' &&
    'batchSize' in body
  ) {
    candidate = (body as Record<string, unknown>).batchSize;
  }

  if (candidate === null || candidate === undefined) {
    return DEFAULT_POLICY.batchSize;
  }

  const n = toFiniteNumber(candidate);
  if (n === null) return { error: 'batchSize must be a number' };

  return clampInt(n, BATCH_MIN, BATCH_MAX);
}

function parseOlderThanPolicy(
  req: NextRequest,
  body: unknown
): OlderThanPolicy | { error: string } {
  const qLegacy = req.nextUrl.searchParams.get('olderThanMinutes');
  if (qLegacy !== null && qLegacy !== undefined) {
    const n = toFiniteNumber(qLegacy);
    if (n === null) return { error: 'olderThanMinutes must be a number' };

    return {
      ...DEFAULT_POLICY.olderThanMinutes,
      stalePending: clampInt(n, MIN_MINUTES, MAX_MINUTES),
    };
  }

  let candidate: unknown = null;
  if (body && typeof body === 'object' && 'olderThanMinutes' in body) {
    candidate = (body as Record<string, unknown>).olderThanMinutes;
  } else {
    return DEFAULT_POLICY.olderThanMinutes;
  }

  if (typeof candidate === 'number' || typeof candidate === 'string') {
    const n = toFiniteNumber(candidate);
    if (n === null) return { error: 'olderThanMinutes must be a number' };

    return {
      ...DEFAULT_POLICY.olderThanMinutes,
      stalePending: clampInt(n, MIN_MINUTES, MAX_MINUTES),
    };
  }

  if (!candidate || typeof candidate !== 'object') {
    return { error: 'olderThanMinutes must be a number or an object' };
  }

  const obj = candidate as Record<string, unknown>;
  const out: OlderThanPolicy = { ...DEFAULT_POLICY.olderThanMinutes };

  for (const key of [
    'stuckReserving',
    'stalePending',
    'orphanNoPayment',
  ] as const) {
    if (!(key in obj)) continue;
    const n = toFiniteNumber(obj[key]);
    if (n === null)
      return { error: `olderThanMinutes.${key} must be a number` };
    out[key] = clampInt(n, MIN_MINUTES, MAX_MINUTES);
  }

  return out;
}

function parseMaxRuntimeMs(
  req: NextRequest,
  body: unknown
): number | { error: string } {
  const q = req.nextUrl.searchParams.get('maxRuntimeMs');
  let candidate: unknown = q;

  if (
    (candidate === null || candidate === undefined) &&
    body &&
    typeof body === 'object' &&
    'maxRuntimeMs' in body
  ) {
    candidate = (body as Record<string, unknown>).maxRuntimeMs;
  }

  if (candidate === null || candidate === undefined) {
    return DEFAULT_MAX_RUNTIME_MS;
  }

  const n = toFiniteNumber(candidate);
  if (n === null) return { error: 'maxRuntimeMs must be a number' };

  return clampInt(n, MAX_RUNTIME_MIN_MS, MAX_RUNTIME_MAX_MS);
}

function parseRequestedMinIntervalSeconds(
  req: NextRequest,
  body: unknown
): number | { error: string } {
  const q = req.nextUrl.searchParams.get('minIntervalSeconds');
  let candidate: unknown = q;

  if (
    (candidate === null || candidate === undefined) &&
    body &&
    typeof body === 'object' &&
    'minIntervalSeconds' in body
  ) {
    candidate = (body as Record<string, unknown>).minIntervalSeconds;
  }

  if (candidate === null || candidate === undefined) {
    return DEFAULT_REQUESTED_MIN_INTERVAL_SECONDS;
  }

  const n = toFiniteNumber(candidate);
  if (n === null) return { error: 'minIntervalSeconds must be a number' };

  return clampInt(n, MIN_INTERVAL_SECONDS_MIN, MIN_INTERVAL_SECONDS_MAX);
}

function getEnvMinIntervalSeconds(): number {
  if (process.env.NODE_ENV === 'test') return 0;

  const fallback = process.env.NODE_ENV === 'production' ? 300 : 60;
  const n = toFiniteNumber(process.env.INTERNAL_JANITOR_MIN_INTERVAL_SECONDS);
  const v = n === null ? fallback : n;

  return clampInt(v, 0, MIN_INTERVAL_SECONDS_MAX);
}

type GateRow = { next_allowed_at: unknown };

function normalizeDate(x: unknown): Date | null {
  if (!x) return null;
  if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
  const d = new Date(String(x));
  return isNaN(d.getTime()) ? null : d;
}

async function acquireJobSlot(params: {
  jobName: string;
  effectiveMinIntervalSeconds: number;
  runId: string;
}) {
  const { jobName, effectiveMinIntervalSeconds, runId } = params;

  const res = await db.execute<GateRow>(sql`
    INSERT INTO internal_job_state (job_name, next_allowed_at, last_run_id, updated_at)
    VALUES (
      ${jobName},
      now() + make_interval(secs => ${effectiveMinIntervalSeconds}),
      ${runId}::uuid,
      now()
    )
    ON CONFLICT (job_name) DO UPDATE
      SET next_allowed_at = now() + make_interval(secs => ${effectiveMinIntervalSeconds}),
          last_run_id = ${runId}::uuid,
          updated_at = now()
      WHERE internal_job_state.next_allowed_at <= now()
    RETURNING next_allowed_at
  `);

  const rows = (res as any).rows ?? [];
  if (rows.length > 0) return { ok: true as const };

  const res2 = await db.execute<GateRow>(sql`
    SELECT next_allowed_at
    FROM internal_job_state
    WHERE job_name = ${jobName}
    LIMIT 1
  `);

  const rows2 = (res2 as any).rows ?? [];
  const nextAllowedAt = normalizeDate(rows2[0]?.next_allowed_at);

  return { ok: false as const, nextAllowedAt };
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
    jobName: 'restock-stale',
  };

  const blocked = guardNonBrowserOnly(request);
  if (blocked) {
    logWarn('internal_janitor_origin_blocked', {
      ...baseMeta,
      code: 'ORIGIN_BLOCKED',
    });
    return blocked;
  }

  const authRes = requireInternalJanitorAuth(request);
  if (authRes) {
    const status =
      (authRes as any).status ?? (authRes as any).statusCode ?? 401;

    logWarn('internal_janitor_auth_rejected', {
      ...baseMeta,
      code: String(status),
      status,
    });

    return authRes;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch (error) {
    logWarn('internal_janitor_payload_parse_failed', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const batchSizeParsed = parseBatchSize(request, body);
  if (typeof batchSizeParsed === 'object' && 'error' in batchSizeParsed) {
    logWarn('internal_janitor_invalid_payload', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      field: 'batchSize',
      reason: batchSizeParsed.error,
    });

    return NextResponse.json(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: batchSizeParsed.error,
      },
      { status: 400 }
    );
  }

  const olderThanParsed = parseOlderThanPolicy(request, body);
  if (typeof olderThanParsed === 'object' && 'error' in olderThanParsed) {
    logWarn('internal_janitor_invalid_payload', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      field: 'olderThanMinutes',
      reason: olderThanParsed.error,
    });

    return NextResponse.json(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: olderThanParsed.error,
      },
      { status: 400 }
    );
  }

  const maxRuntimeParsed = parseMaxRuntimeMs(request, body);
  if (typeof maxRuntimeParsed === 'object' && 'error' in maxRuntimeParsed) {
    logWarn('internal_janitor_invalid_payload', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      field: 'maxRuntimeMs',
      reason: maxRuntimeParsed.error,
    });

    return NextResponse.json(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: maxRuntimeParsed.error,
      },
      { status: 400 }
    );
  }

  const requestedMinIntervalParsed = parseRequestedMinIntervalSeconds(
    request,
    body
  );
  if (
    typeof requestedMinIntervalParsed === 'object' &&
    'error' in requestedMinIntervalParsed
  ) {
    logWarn('internal_janitor_invalid_payload', {
      ...baseMeta,
      code: 'INVALID_PAYLOAD',
      field: 'minIntervalSeconds',
      reason: requestedMinIntervalParsed.error,
    });

    return NextResponse.json(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: requestedMinIntervalParsed.error,
      },
      { status: 400 }
    );
  }

  const policy: SweepPolicy = {
    batchSize: batchSizeParsed,
    olderThanMinutes: olderThanParsed,
  };

  const maxRuntimeMs = maxRuntimeParsed;

  const envMinIntervalSeconds = getEnvMinIntervalSeconds();
  const requestedMinIntervalSeconds = requestedMinIntervalParsed;

  const minIntervalSeconds = Math.max(
    envMinIntervalSeconds,
    requestedMinIntervalSeconds
  );

  const runId = crypto.randomUUID();
  const jobName = baseMeta.jobName;
  const workerId = `janitor:${runId}`;

  const gate = await acquireJobSlot({
    jobName,
    effectiveMinIntervalSeconds: minIntervalSeconds,
    runId,
  });

  if (!gate.ok) {
    const retryAfterSeconds = gate.nextAllowedAt
      ? Math.max(
          1,
          Math.ceil((gate.nextAllowedAt.getTime() - Date.now()) / 1000)
        )
      : Math.max(1, minIntervalSeconds);
    logWarn('internal_janitor_rate_limited', {
      ...baseMeta,
      code: 'RATE_LIMITED',
      runId,
      workerId,
      retryAfterSeconds,
      minIntervalSeconds,
    });

    const res = NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(retryAfterSeconds));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  try {
    const startedAtMs = Date.now();
    const deadlineMs = startedAtMs + maxRuntimeMs;

    const remaining0 = Math.max(0, deadlineMs - Date.now());
    const processedStuckReserving = await restockStuckReservingOrders({
      olderThanMinutes: policy.olderThanMinutes.stuckReserving,
      batchSize: policy.batchSize,
      workerId,
      timeBudgetMs: remaining0,
    });

    const remaining1 = Math.max(0, deadlineMs - Date.now());
    const processedStalePending = await restockStalePendingOrders({
      olderThanMinutes: policy.olderThanMinutes.stalePending,
      batchSize: policy.batchSize,
      workerId,
      timeBudgetMs: remaining1,
    });

    const remaining2 = Math.max(0, deadlineMs - Date.now());
    const processedOrphanNoPayment = await restockStaleNoPaymentOrders({
      olderThanMinutes: policy.olderThanMinutes.orphanNoPayment,
      batchSize: policy.batchSize,
      workerId,
      timeBudgetMs: remaining2,
    });

    const processed =
      processedStuckReserving +
      processedStalePending +
      processedOrphanNoPayment;

    logInfo('internal_janitor_run_completed', {
      ...baseMeta,
      code: 'OK',
      runId,
      jobName,
      workerId,
      processed,
      processedByCategory: {
        stuckReserving: processedStuckReserving,
        stalePending: processedStalePending,
        orphanNoPayment: processedOrphanNoPayment,
      },
      batchSize: policy.batchSize,
      appliedPolicy: policy,
      maxRuntimeMs,
      minIntervalSeconds,
      runtimeMs: Date.now() - startedAtMs,
    });

    return NextResponse.json({
      success: true,
      runId,
      processed,
      processedByCategory: {
        stuckReserving: processedStuckReserving,
        stalePending: processedStalePending,
        orphanNoPayment: processedOrphanNoPayment,
      },
      batchSize: policy.batchSize,
      olderThanMinutes: policy.olderThanMinutes.stalePending,
      appliedPolicy: policy,
      maxRuntimeMs,
      minIntervalSeconds,
    });
  } catch (e) {
    logError('internal_janitor_restock_stale_failed', e, {
      ...baseMeta,
      code: 'JANITOR_RESTOCK_STALE_FAILED',
      runId,
      jobName,
      workerId,
    });

    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
