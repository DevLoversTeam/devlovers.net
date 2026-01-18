import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from '@/db';

type GateRow = { window_started_at: unknown; count: unknown };

function normalizeDate(x: unknown): Date | null {
  if (!x) return null;
  if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
  const d = new Date(String(x));
  return isNaN(d.getTime()) ? null : d;
}

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function getClientIp(request: NextRequest): string | null {
  const h = request.headers;

  const cf = (h.get('cf-connecting-ip') ?? '').trim();
  if (cf) return cf;

  const xr = (h.get('x-real-ip') ?? '').trim();
  if (xr) return xr;

  const xff = (h.get('x-forwarded-for') ?? '').trim();
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    return first?.length ? first : null;
  }

  return null;
}

export type RateLimitOk = { ok: true; remaining: number };
export type RateLimitNo = { ok: false; retryAfterSeconds: number };
export type RateLimitDecision = RateLimitOk | RateLimitNo;

/**
 * DB-backed fixed-window limiter (cross-instance).
 * - Atomic insert/update with conditional WHERE to avoid going above limit.
 * - If limited: computes Retry-After from stored window_started_at.
 */
export async function enforceRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitDecision> {
  const limit = Math.max(0, Math.floor(params.limit));
  const windowSeconds = Math.max(1, Math.floor(params.windowSeconds));
  const key = params.key;

  // Allow disabling via env (for emergency): RATE_LIMIT_DISABLED=1
  if (envInt('RATE_LIMIT_DISABLED', 0) === 1) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  if (!key || limit <= 0) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const res = await db.execute<GateRow>(sql`
    INSERT INTO api_rate_limits (key, window_started_at, count, updated_at)
    VALUES (${key}, now(), 1, now())
    ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN api_rate_limits.window_started_at <= now() - make_interval(secs => ${windowSeconds})
            THEN 1
          ELSE api_rate_limits.count + 1
        END,
        window_started_at = CASE
          WHEN api_rate_limits.window_started_at <= now() - make_interval(secs => ${windowSeconds})
            THEN now()
          ELSE api_rate_limits.window_started_at
        END,
        updated_at = now()
      WHERE
        api_rate_limits.window_started_at <= now() - make_interval(secs => ${windowSeconds})
        OR api_rate_limits.count < ${limit}
    RETURNING window_started_at, count
  `);

  const rows = (res as any).rows ?? [];
  if (rows.length > 0) {
    const count = Number(rows[0]?.count ?? 1);
    const remaining = Math.max(0, limit - count);
    return { ok: true, remaining };
  }

  const res2 = await db.execute<GateRow>(sql`
    SELECT window_started_at, count
    FROM api_rate_limits
    WHERE key = ${key}
    LIMIT 1
  `);

  const rows2 = (res2 as any).rows ?? [];
  const startedAt = normalizeDate(rows2[0]?.window_started_at) ?? new Date();
  const windowEndMs = startedAt.getTime() + windowSeconds * 1000;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowEndMs - Date.now()) / 1000)
  );

  return { ok: false, retryAfterSeconds };
}

export function rateLimitResponse(params: {
  code?: string;
  retryAfterSeconds: number;
  details?: Record<string, unknown>;
}): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.floor(params.retryAfterSeconds));
  const code = params.code ?? 'RATE_LIMITED';

  const res = NextResponse.json(
    {
      success: false,
      code,
      retryAfterSeconds,
      ...(params.details ? { details: params.details } : {}),
    },
    { status: 429 }
  );

  res.headers.set('Retry-After', String(retryAfterSeconds));
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
