import crypto from 'node:crypto';

export const STATUS_TOKEN_SCOPES = [
  'status_lite',
  'order_payment_init',
  'order_quote_request',
  'order_quote_accept',
  'order_quote_decline',
] as const;

export type StatusTokenScope = (typeof STATUS_TOKEN_SCOPES)[number];

const STATUS_TOKEN_SCOPE_SET = new Set<string>(STATUS_TOKEN_SCOPES);
const DEFAULT_STATUS_TOKEN_SCOPES: readonly StatusTokenScope[] = [
  'status_lite',
];

type TokenPayload = {
  v: 1;
  orderId: string;
  iat: number;
  exp: number;
  nonce: string;
  scp: StatusTokenScope[];
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

function normalizeScopes(raw: unknown): StatusTokenScope[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<StatusTokenScope>();
  const out: StatusTokenScope[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const scope = item.trim() as StatusTokenScope;
    if (!STATUS_TOKEN_SCOPE_SET.has(scope)) continue;
    if (seen.has(scope)) continue;
    seen.add(scope);
    out.push(scope);
  }

  return out;
}

export function createStatusToken(args: {
  orderId: string;
  ttlSeconds?: number;
  nowMs?: number;
  scopes?: StatusTokenScope[];
}): string {
  const secret = getSecret();
  const nowMs = args.nowMs ?? Date.now();
  const iat = Math.floor(nowMs / 1000);
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const exp = iat + ttl;
  const explicitScopes = normalizeScopes(args.scopes);
  const resolvedScopes =
    explicitScopes.length > 0
      ? explicitScopes
      : [...DEFAULT_STATUS_TOKEN_SCOPES];

  const payload: TokenPayload = {
    v: 1,
    orderId: args.orderId,
    iat,
    exp,
    nonce: crypto.randomUUID(),
    scp: resolvedScopes,
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
    const rawPayload = JSON.parse(base64UrlDecode(body).toString('utf-8')) as {
      v?: unknown;
      orderId?: unknown;
      iat?: unknown;
      exp?: unknown;
      nonce?: unknown;
      scp?: unknown;
    };

    const rawScopes = normalizeScopes(rawPayload.scp);
    const scopes =
      rawScopes.length > 0 ? rawScopes : [...DEFAULT_STATUS_TOKEN_SCOPES];

    payload = {
      v: rawPayload.v as TokenPayload['v'],
      orderId: rawPayload.orderId as TokenPayload['orderId'],
      iat: rawPayload.iat as TokenPayload['iat'],
      exp: rawPayload.exp as TokenPayload['exp'],
      nonce: rawPayload.nonce as TokenPayload['nonce'],
      scp: scopes,
    };
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

export function hasStatusTokenScope(
  payload: Pick<TokenPayload, 'scp'>,
  scope: StatusTokenScope
): boolean {
  return Array.isArray(payload.scp) && payload.scp.includes(scope);
}
