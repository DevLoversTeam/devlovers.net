// lib/auth/internal-janitor.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function requireInternalJanitorAuth(
  req: NextRequest
): NextResponse | null {
  const secret = (process.env.INTERNAL_JANITOR_SECRET ?? '').trim();

  if (!secret) {
    return NextResponse.json(
      { success: false, code: 'JANITOR_DISABLED' },
      { status: 503 }
    );
  }

  const provided =
    (req.headers.get('x-internal-janitor-secret') ?? '').trim() ||
    (req.headers.get('x-internal-secret') ?? '').trim();

  if (!provided) {
    return NextResponse.json(
      { success: false, code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN' },
      { status: 403 }
    );
  }

  return null;
}
