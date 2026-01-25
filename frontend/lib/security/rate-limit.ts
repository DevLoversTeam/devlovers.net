import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';

import { db } from '@/db';

type GateRow = { window_started_at: unknown; count: unknown };

const SUBJECT_PREFIXES = [
  'checkout:',
  'stripe_webhook:missing_sig:',
  'stripe_webhook:invalid_sig:',
];

const SAFE_SUBJECT_RE = /^[a-zA-Z0-9._-]$/;

function hashSubject(subject: string, prefix: string): string {
  const digest = createHash('sha256')
    .update(subject, 'utf8')
    .digest('base64url');
  return `${prefix}${digest.slice(0, 16)}`;
}

function sanitizeSubject(subject: string): string {
  if (!subject) return 'anon';
  let sanitized = '';
  let lastUnderscore = false;
  for (const char of subject) {
    if (SAFE_SUBJECT_RE.test(char)) {
      sanitized += char;
      lastUnderscore = false;
      continue;
    }
    if (!lastUnderscore) {
      sanitized += '_';
      lastUnderscore = true;
    }
  }
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  if (!sanitized) return 'anon';
  if (sanitized.length > 64) return hashSubject(subject, 'h_');
  return sanitized;
}

export function normalizeRateLimitSubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return 'anon';

  const ipKind = isIP(trimmed); // 0 | 4 | 6
  if (ipKind === 6) return hashSubject(trimmed, 'ip6_');
  if (ipKind === 4) return trimmed;

  return sanitizeSubject(trimmed);
}

function normalizeRateLimitKey(key: string): {
  legacyKey: string;
  normalizedKey: string;
} {
  const legacyKey = key;
  if (!key) return { legacyKey, normalizedKey: key };
  const prefix = SUBJECT_PREFIXES.find(candidate => key.startsWith(candidate));
  if (prefix) {
    const subject = key.slice(prefix.length);
    const normalizedSubject = normalizeRateLimitSubject(subject);
    if (normalizedSubject === subject) return { legacyKey, normalizedKey: key };
    return { legacyKey, normalizedKey: `${prefix}${normalizedSubject}` };
  }
  const lastColon = key.lastIndexOf(':');
  if (lastColon === -1) return { legacyKey, normalizedKey: key };
  const subject = key.slice(lastColon + 1);
  const normalizedSubject = normalizeRateLimitSubject(subject);
  if (normalizedSubject === subject) return { legacyKey, normalizedKey: key };
  return {
    legacyKey,
    normalizedKey: `${key.slice(0, lastColon + 1)}${normalizedSubject}`,
  };
}

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

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;

  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on')
    return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off')
    return false;

  return fallback;
}

export function getClientIpFromHeaders(headers: Headers): string | null {
  const trustForwarded = envBool(
    'TRUST_FORWARDED_HEADERS',
    process.env.NODE_ENV !== 'production'
  );
  const trustCf = envBool('TRUST_CF_CONNECTING_IP', false);

  // Allow Cloudflare canonical header (highest priority) only when explicitly trusted.
  if (trustCf) {
    const cf = (headers.get('cf-connecting-ip') ?? '').trim();
    if (cf && isIP(cf)) return cf;
  }

  // Trusted boundary: if we don't trust forwarded headers,
  // do NOT fall back to spoofable headers.
  if (!trustForwarded) return null;

  const xr = (headers.get('x-real-ip') ?? '').trim();
  if (xr && isIP(xr)) return xr;

  const xff = (headers.get('x-forwarded-for') ?? '').trim();
  if (xff) {
    for (const part of xff.split(',')) {
      const candidate = part.trim();
      if (candidate && isIP(candidate)) return candidate;
    }
  }

  return null;
}

export function getClientIp(request: NextRequest): string | null {
  return getClientIpFromHeaders(request.headers);
}

export function getRateLimitSubject(request: NextRequest): string {
  const ip = getClientIp(request);
  // Keep subject clean/stable for IPv6 (no ":"), consistent with key normalization.
  if (ip) return normalizeRateLimitSubject(ip);

  const ua = (request.headers.get('user-agent') ?? '').trim();
  const al = (request.headers.get('accept-language') ?? '').trim();
  const baseString = `${ua}|${al}`;
  const hash = createHash('sha256').update(baseString).digest('base64url');
  return `ua_${hash.slice(0, 16)}`;
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
  const { legacyKey, normalizedKey } = normalizeRateLimitKey(params.key);
  const key = normalizedKey;

  // Allow disabling via env (for emergency): RATE_LIMIT_DISABLED=1
  if (envInt('RATE_LIMIT_DISABLED', 0) === 1) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  if (!key || limit <= 0) {
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  if (legacyKey !== normalizedKey) {
    try {
      await db.execute(sql`
        UPDATE api_rate_limits
        SET key = ${normalizedKey}
        WHERE key = ${legacyKey}
          AND NOT EXISTS (
            SELECT 1 FROM api_rate_limits WHERE key = ${normalizedKey}
          )
      `);
    } catch {
      // Ignore conflicts; fall through to use normalizedKey for enforcement.
    }
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
