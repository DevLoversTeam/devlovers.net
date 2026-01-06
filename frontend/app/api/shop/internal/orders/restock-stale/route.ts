import { NextRequest, NextResponse } from 'next/server';
import { restockStalePendingOrders } from '@/lib/services/orders';
import { requireInternalJanitorAuth } from '@/lib/auth/internal-janitor';

export const runtime = 'nodejs';

function parseOlderThanMinutes(req: NextRequest, body: unknown): number | null {
  const q = req.nextUrl.searchParams.get('olderThanMinutes');
  let candidate: unknown = q;

  if (
    (candidate === null || candidate === undefined) &&
    body &&
    typeof body === 'object' &&
    'olderThanMinutes' in body
  ) {
    candidate = (body as Record<string, unknown>).olderThanMinutes;
  }

  if (candidate === undefined || candidate === null) return null;

  const n = Number(candidate);
  if (!Number.isFinite(n)) return null;

  return Math.floor(n);
}

export async function POST(request: NextRequest) {
  const authRes = requireInternalJanitorAuth(request);
  if (authRes) return authRes;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // ignore invalid/missing json body; query param may be used instead
  }

  const parsed = parseOlderThanMinutes(request, body);

  const DEFAULT = 60;
  const MIN = 10; // NOT 0
  const MAX = 60 * 24 * 7;

  const effectiveOlderThanMinutes =
    parsed == null ? DEFAULT : Math.max(MIN, Math.min(MAX, parsed));

  const processed = await restockStalePendingOrders({
    olderThanMinutes: effectiveOlderThanMinutes,
  });

  return NextResponse.json({
    success: true,
    processed,
    olderThanMinutes: effectiveOlderThanMinutes,
  });
}
