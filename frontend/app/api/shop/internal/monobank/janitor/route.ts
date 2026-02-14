import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { guardNonBrowserOnly } from '@/lib/security/origin';
import {
  runMonobankJanitorJob1,
  runMonobankJanitorJob2,
  runMonobankJanitorJob3,
  runMonobankJanitorJob4,
} from '@/lib/services/orders/monobank-janitor';

const ROUTE_PATH = '/api/shop/internal/monobank/janitor' as const;
const JOB_PREFIX = 'monobank-janitor:' as const;
const JOB_NAMES = ['job1', 'job2', 'job3', 'job4'] as const;
const JOB_NAME_SET = new Set<string>(JOB_NAMES);

type JobName = (typeof JOB_NAMES)[number];

const JOB_NAME_RE = /^[a-z0-9-]{1,32}$/;

const janitorPayloadSchema = z
  .object({
    job: z
      .string()
      .regex(JOB_NAME_RE)
      .refine(value => JOB_NAME_SET.has(value), { message: 'Invalid job' }),
    dryRun: z.boolean().optional(),
    limit: z.number().int().optional(),
  })
  .strict();

type GateRow = { next_allowed_at: unknown };

function noStoreJson(
  body: unknown,
  requestId: string,
  init?: { status?: number; headers?: HeadersInit }
) {
  const res = NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Request-Id', requestId);
  return res;
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  const maxLen = Math.max(aBuf.length, bBuf.length, 1);

  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);
  aBuf.copy(aPadded);
  bBuf.copy(bPadded);

  const equalPadded = crypto.timingSafeEqual(aPadded, bPadded);
  return equalPadded && aBuf.length === bBuf.length;
}

function readConfiguredInternalSecret(): string | null {
  const preferred = (process.env.INTERNAL_JANITOR_SECRET ?? '').trim();
  if (preferred) return preferred;

  const fallback = (process.env.INTERNAL_SECRET ?? '').trim();
  if (fallback) return fallback;

  return null;
}

function requireInternalJanitorAuth(args: {
  request: NextRequest;
  requestId: string;
  baseMeta: Record<string, unknown>;
}): NextResponse | null {
  const configured = readConfiguredInternalSecret();
  if (!configured) {
    logError('internal_monobank_janitor_auth_misconfigured', undefined, {
      ...args.baseMeta,
      code: 'INTERNAL_SECRET_MISCONFIG',
    });
    return noStoreJson(
      {
        success: false,
        code: 'SERVER_MISCONFIG',
        message: 'Internal auth is not configured',
        requestId: args.requestId,
      },
      args.requestId,
      { status: 500 }
    );
  }

  const provided =
    (args.request.headers.get('x-internal-janitor-secret') ?? '').trim() ||
    (args.request.headers.get('x-internal-secret') ?? '').trim();

  if (!provided || !timingSafeEqual(provided, configured)) {
    return noStoreJson(
      {
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        requestId: args.requestId,
      },
      args.requestId,
      { status: 401 }
    );
  }

  return null;
}

function invalidPayload(
  requestId: string,
  message: string
): NextResponse<unknown> {
  return noStoreJson(
    {
      success: false,
      code: 'INVALID_PAYLOAD',
      message,
      requestId,
    },
    requestId,
    { status: 400 }
  );
}

function normalizeDate(x: unknown): Date | null {
  if (!x) return null;
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x;
  const d = new Date(String(x));
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMinIntervalSeconds(): number {
  if (process.env.NODE_ENV === 'test') return 0;

  const fallback = process.env.NODE_ENV === 'production' ? 300 : 60;
  const parsed = Number(process.env.INTERNAL_JANITOR_MIN_INTERVAL_SECONDS);
  const base = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.max(0, Math.min(3600, base));
}

async function acquireJobSlot(params: {
  jobName: string;
  minIntervalSeconds: number;
  runId: string;
}) {
  const res = await db.execute<GateRow>(sql`
    INSERT INTO internal_job_state (job_name, next_allowed_at, last_run_id, updated_at)
    VALUES (
      ${params.jobName},
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

  const res2 = await db.execute<GateRow>(sql`
    SELECT next_allowed_at
    FROM internal_job_state
    WHERE job_name = ${params.jobName}
    LIMIT 1
  `);

  const rows2 = (res2 as any).rows ?? [];
  const nextAllowedAt = normalizeDate(rows2[0]?.next_allowed_at);
  return { ok: false as const, nextAllowedAt };
}

function parsePayloadErrorMessage(error: z.ZodError): string {
  for (const issue of error.issues) {
    if (issue.path[0] === 'job') return 'Invalid job';
  }
  return 'Invalid payload';
}

export async function POST(request: NextRequest) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: ROUTE_PATH,
    method: 'POST',
    jobName: 'monobank-janitor',
  };

  const blocked = guardNonBrowserOnly(request);
  if (blocked) {
    blocked.headers.set('X-Request-Id', requestId);
    logWarn('internal_monobank_janitor_origin_blocked', {
      ...baseMeta,
      code: 'ORIGIN_BLOCKED',
    });
    return blocked;
  }

  const authResponse = requireInternalJanitorAuth({
    request,
    requestId,
    baseMeta,
  });
  if (authResponse) {
    if (authResponse.status === 401) {
      logWarn('internal_monobank_janitor_auth_rejected', {
        ...baseMeta,
        code: 'UNAUTHORIZED',
      });
    }
    return authResponse;
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return invalidPayload(requestId, 'Content-Type must be application/json');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return invalidPayload(requestId, 'Invalid JSON body');
  }

  const parsed = janitorPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return invalidPayload(requestId, parsePayloadErrorMessage(parsed.error));
  }

  const job = parsed.data.job as JobName;
  const dryRun = parsed.data.dryRun ?? false;
  const limit = Math.max(1, Math.min(500, parsed.data.limit ?? 100));

  logInfo('internal_monobank_janitor_request_accepted', {
    ...baseMeta,
    code: 'JANITOR_REQUEST_ACCEPTED',
    job,
    dryRun,
    limit,
  });

  const runId = crypto.randomUUID();
  const gateKey = `${JOB_PREFIX}${job}`;
  const minIntervalSeconds = getMinIntervalSeconds();

  try {
    const gate = await acquireJobSlot({
      jobName: gateKey,
      minIntervalSeconds,
      runId,
    });

    if (!gate.ok) {
      const retryAfterSeconds = gate.nextAllowedAt
        ? Math.max(
            1,
            Math.ceil((gate.nextAllowedAt.getTime() - Date.now()) / 1000)
          )
        : Math.max(1, minIntervalSeconds || 1);

      logWarn('internal_monobank_janitor_rate_limited', {
        ...baseMeta,
        code: 'JANITOR_RATE_LIMITED',
        job,
        dryRun,
        limit,
        gateKey,
        runId,
        retryAfterSeconds,
      });

      return noStoreJson(
        {
          success: false,
          code: 'RATE_LIMITED',
          retryAfterSeconds,
          requestId,
        },
        requestId,
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        }
      );
    }

    if (job === 'job1') {
      const result = await runMonobankJanitorJob1({
        dryRun,
        limit,
        requestId,
        runId,
        baseMeta,
      });

      return noStoreJson(
        {
          success: true,
          job,
          dryRun,
          limit,
          processed: result.processed,
          applied: result.applied,
          noop: result.noop,
          failed: result.failed,
          requestId,
        },
        requestId,
        { status: 200 }
      );
    }

    if (job === 'job2') {
      const result = await runMonobankJanitorJob2({
        dryRun,
        limit,
        requestId,
        runId,
        baseMeta,
      });

      return noStoreJson(
        {
          success: true,
          job,
          dryRun,
          limit,
          processed: result.processed,
          applied: result.applied,
          noop: result.noop,
          failed: result.failed,
          requestId,
        },
        requestId,
        { status: 200 }
      );
    }

    if (job === 'job3') {
      const result = await runMonobankJanitorJob3({
        dryRun,
        limit,
        requestId,
        runId,
        baseMeta,
      });

      return noStoreJson(
        {
          success: true,
          job,
          dryRun,
          limit,
          processed: result.processed,
          applied: result.applied,
          noop: result.noop,
          failed: result.failed,
          requestId,
        },
        requestId,
        { status: 200 }
      );
    }

    if (job === 'job4') {
      const result = await runMonobankJanitorJob4({
        dryRun,
        limit,
        requestId,
        runId,
        baseMeta,
      });

      return noStoreJson(
        {
          success: true,
          job,
          dryRun,
          limit,
          processed: result.processed,
          applied: result.applied,
          noop: result.noop,
          failed: result.failed,
          report: result.report,
          requestId,
        },
        requestId,
        { status: 200 }
      );
    }

    logInfo('internal_monobank_janitor_not_implemented', {
      ...baseMeta,
      code: 'JANITOR_NOT_IMPLEMENTED',
      job,
      dryRun,
      limit,
      gateKey,
      runId,
    });

    return noStoreJson(
      {
        success: false,
        code: 'JANITOR_NOT_IMPLEMENTED',
        job,
        dryRun,
        limit,
        requestId,
      },
      requestId,
      { status: 501 }
    );
  } catch (error) {
    const err = error as { code?: unknown; status?: unknown } | null;
    if (err?.code === 'MONO_WEBHOOK_MODE_NOT_STORE') {
      return noStoreJson(
        {
          success: false,
          code: 'MONO_WEBHOOK_MODE_NOT_STORE',
          requestId,
        },
        requestId,
        { status: 409 }
      );
    }

    logError('internal_monobank_janitor_failed', error, {
      ...baseMeta,
      code: 'INTERNAL_ERROR',
      job,
      dryRun,
      limit,
      gateKey,
      runId,
    });

    return noStoreJson(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        requestId,
      },
      requestId,
      { status: 500 }
    );
  }
}
