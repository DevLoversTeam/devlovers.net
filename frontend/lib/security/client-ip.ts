import 'server-only';

import type { NextRequest } from 'next/server';
import { isIP } from 'node:net';

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

  const netlifyIp = (headers.get('x-nf-client-connection-ip') ?? '').trim();
  if (netlifyIp && isIP(netlifyIp)) return netlifyIp;

  if (trustCf) {
    const cf = (headers.get('cf-connecting-ip') ?? '').trim();
    if (cf && isIP(cf)) return cf;
  }

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
