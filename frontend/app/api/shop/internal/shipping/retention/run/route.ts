import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';
import { getShopShippingFlags } from '@/lib/env/nova-poshta';
import { logError, logWarn } from '@/lib/logging';
import { guardNonBrowserFailClosed } from '@/lib/security/origin';
import {
  sanitizeShippingErrorForLog,
  sanitizeShippingLogMeta,
} from '@/lib/services/shop/shipping/log-sanitizer';
import { anonymizeRetainedOrderShippingSnapshots } from '@/lib/services/shop/shipping/retention';
import { internalShippingRetentionRunPayloadSchema } from '@/lib/validation/shop-shipping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ROUTE_PATH = '/api/shop/internal/shipping/retention/run';
const JOB_NAME = 'shipping-retention-run';
function isLocalBypassEnabled(): boolean {
  const appEnv = String(process.env.APP_ENV ?? '').toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV ?? '').toLowerCase();
  const disabled = String(process.env.RATE_LIMIT_DISABLED ?? '').toLowerCase();

  return (
    appEnv === 'local' ||
    nodeEnv === 'development' ||
    disabled === 'true' ||
    disabled === '1'
  );
}

type GateRow = { next_allowed_at: unknown };

function normalizeDate(x: unknown): Date | null {
  if (!x) return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}

function noStoreJson(body: unknown, requestId: string, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Request-Id', requestId);
  return res;
}

function retryAfterSeconds(nextAllowedAt: Date | null): number {
  if (!nextAllowedAt) return 1;
  return Math.max(1, Math.ceil((nextAllowedAt.getTime() - Date.now()) / 1000));
}

async function acquireJobSlot(params: {
  runId: string;
  minIntervalSeconds: number;
}) {
  const res = await db.execute<GateRow>(sql`
    INSERT INTO internal_job_state (job_name, next_allowed_at, last_run_id, updated_at)
    VALUES (
      ${JOB_NAME},
      now() + make_interval(secs => ${params.minIntervalSeconds}),
      ${params.runId}::uuid,
      now()
    )
    ON CONFLICT (job_name) DO UPDATE
      SET next_allowed_at = now() + make_interval(secs => ${params.minIntervalSeconds}),
          last_run_id = ${params.runId}::uuid,
          updated_at = now()
      WHERE internal_job_state.next_allowed_at <= now()
    RETURNING next_allowed_at
  `);

  const rows = (res as any).rows ?? [];
  if (rows.length > 0) return { ok: true as const };

  const fallback = await db.execute<GateRow>(sql`
    SELECT next_allowed_at
    FROM internal_job_state
    WHERE job_name = ${JOB_NAME}
    LIMIT 1
  `);
  const rows2 = (fallback as any).rows ?? [];
  const nextAllowedAt = normalizeDate(rows2[0]?.next_allowed_at);
  return { ok: false as const, nextAllowedAt };
}

async function readJsonBodyOrDefault(request: NextRequest): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const runId = crypto.randomUUID();
  const baseMeta = {
    requestId,
    runId,
    route: ROUTE_PATH,
    method: request.method,
  };
  const safeBaseMeta = sanitizeShippingLogMeta(baseMeta) ?? baseMeta;

  const blocked = guardNonBrowserFailClosed(request, {
    surface: 'shop_shipping_retention',
  });
  if (blocked) {
    blocked.headers.set('X-Request-Id', requestId);
    return blocked;
  }

  const authRes = requireInternalJanitorAuth(request);
  if (authRes) {
    authRes.headers.set('X-Request-Id', requestId);
    authRes.headers.set('Cache-Control', 'no-store');
    return authRes;
  }

  const flags = getShopShippingFlags();
  if (!flags.shippingEnabled || !flags.retentionEnabled) {
    return noStoreJson(
      {
        success: false,
        code: 'FEATURE_DISABLED',
      },
      requestId,
      200
    );
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Content-Type must be application/json',
      },
      requestId,
      400
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBodyOrDefault(request);
  } catch {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid JSON body',
      },
      requestId,
      400
    );
  }

  const parsed = internalShippingRetentionRunPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return noStoreJson(
      {
        success: false,
        code: 'INVALID_PAYLOAD',
        message: 'Invalid payload',
      },
      requestId,
      400
    );
  }

  const bypass = isLocalBypassEnabled();

  const gate = bypass
    ? ({ ok: true as const } as const)
    : await acquireJobSlot({
        runId,
        minIntervalSeconds: parsed.data.minIntervalSeconds,
      });

  if (!gate.ok) {
    const wait = retryAfterSeconds(gate.nextAllowedAt);
    const res = noStoreJson(
      {
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds: wait,
      },
      requestId,
      429
    );
    res.headers.set('Retry-After', String(wait));
    return res;
  }

  const retentionDays = parsed.data.retentionDays ?? flags.retentionDays;

  try {
    const result = await anonymizeRetainedOrderShippingSnapshots({
      runId,
      retentionDays,
      batchSize: parsed.data.batchSize,
    });

    return noStoreJson(
      {
        success: true,
        runId,
        retentionDays,
        batchSize: parsed.data.batchSize,
        processed: result.processed,
      },
      requestId,
      200
    );
  } catch (error) {
    logWarn(
      'shop_shipping_retention_failed',
      sanitizeShippingLogMeta({
        ...safeBaseMeta,
        code: 'RETENTION_FAILED',
      })
    );
    logError(
      'shop_shipping_retention_failed_error',
      sanitizeShippingErrorForLog(error, 'Shipping retention run failed.'),
      sanitizeShippingLogMeta({
        ...safeBaseMeta,
        code: 'RETENTION_FAILED',
      })
    );
    return noStoreJson(
      {
        success: false,
        code: 'RETENTION_FAILED',
      },
      requestId,
      500
    );
  }
}
