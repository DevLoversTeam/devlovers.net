import 'server-only';

import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';

export const CSRF_FORM_FIELD = 'csrfToken' as const;

const DEFAULT_TTL_SECONDS = 60 * 60; // 1h

function getSecret(): string {
  const secret = process.env.CSRF_SECRET;
  if (!secret) throw new Error('Missing env var: CSRF_SECRET');
  return secret;
}

function sign(payloadB64: string): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(payloadB64)
    .digest('base64url');
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function b64urlEncodeUtf8(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function b64urlDecodeUtf8(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Stateless CSRF token: payload(JSON)->base64url + HMAC signature.
 * TTL enforced via exp (unix seconds).
 */
export function issueCsrfToken(
  purpose: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    p: purpose,
    iat: now,
    exp: now + ttlSeconds,
    n: crypto.randomBytes(16).toString('base64url'),
  };

  const payloadB64 = b64urlEncodeUtf8(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyCsrfToken(token: string, purpose: string): boolean {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;

  const expected = sign(payloadB64);
  if (!timingSafeEqual(sig, expected)) return false;

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecodeUtf8(payloadB64));
  } catch {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.p !== purpose) return false;
  if (typeof payload.exp !== 'number' || payload.exp < now) return false;

  return true;
}

/**
 * Secondary defense: same-origin check.
 * Use Origin when present, otherwise fall back to Referer.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const expected = req.nextUrl.origin;

  const origin = req.headers.get('origin');
  if (origin) return origin === expected;

  const referer = req.headers.get('referer');
  if (!referer) return false;

  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
