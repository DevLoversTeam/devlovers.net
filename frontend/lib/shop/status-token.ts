import crypto from 'node:crypto';

type TokenPayload = {
  v: 1;
  orderId: string;
  iat: number;
  exp: number;
  nonce: string;
};

const DEFAULT_TTL_SECONDS = 45 * 60;

function getSecret(): string {
  const raw = process.env.SHOP_STATUS_TOKEN_SECRET ?? '';
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('SHOP_STATUS_TOKEN_SECRET is not configured');
  }
  return trimmed;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function signPayload(payload: TokenPayload, secret: string): string {
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${base64UrlEncode(sig)}`;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createStatusToken(args: {
  orderId: string;
  ttlSeconds?: number;
  nowMs?: number;
}): string {
  const secret = getSecret();
  const nowMs = args.nowMs ?? Date.now();
  const iat = Math.floor(nowMs / 1000);
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = iat + ttl;

  const payload: TokenPayload = {
    v: 1,
    orderId: args.orderId,
    iat,
    exp,
    nonce: crypto.randomUUID(),
  };

  return signPayload(payload, secret);
}

export function verifyStatusToken(args: {
  token: string;
  orderId: string;
  nowMs?: number;
}): { ok: true; payload: TokenPayload } | { ok: false; reason: string } {
  const secret = (() => {
    try {
      return getSecret();
    } catch {
      return null;
    }
  })();
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const parts = args.token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'invalid_format' };

  const [body, sig] = parts;
  if (!body || !sig) return { ok: false, reason: 'invalid_format' };

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(body).digest()
  );
  if (!safeEqual(sig, expectedSig)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(
      base64UrlDecode(body).toString('utf-8')
    ) as TokenPayload;
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (!payload || payload.v !== 1)
    return { ok: false, reason: 'invalid_payload' };
  if (payload.orderId !== args.orderId) {
    return { ok: false, reason: 'order_mismatch' };
  }

  const now = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(payload.exp) || now > payload.exp) {
    return { ok: false, reason: 'expired' };
  }

  if (!Number.isFinite(payload.iat) || payload.iat > now + 60) {
    return { ok: false, reason: 'invalid_iat' };
  }

  return { ok: true, payload };
}
