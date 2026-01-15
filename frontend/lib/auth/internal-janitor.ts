// lib/auth/internal-janitor.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function timingSafeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');

  // Pad both buffers to the same length to avoid length-based early return timing leak.
  // Ensure min length 1 because timingSafeEqual requires non-zero length buffers.
  const maxLen = Math.max(aBuf.length, bBuf.length, 1);

  const aPadded = Buffer.alloc(maxLen);
  const bPadded = Buffer.alloc(maxLen);

  aBuf.copy(aPadded);
  bBuf.copy(bPadded);

  const equalPadded = crypto.timingSafeEqual(aPadded, bPadded);

  // Length check AFTER timingSafeEqual; no early return.
  const lengthEqual = aBuf.length === bBuf.length;

  return equalPadded && lengthEqual;
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
