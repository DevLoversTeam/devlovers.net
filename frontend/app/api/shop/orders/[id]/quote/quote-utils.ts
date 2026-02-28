import { NextResponse } from 'next/server';

type QuoteErrorStatusMode = 'accept' | 'decline' | 'request';

const CONFLICT_CODES = new Set([
  'QUOTE_NOT_APPLICABLE',
  'QUOTE_ALREADY_ACCEPTED',
  'QUOTE_NOT_OFFERED',
]);

const VERSION_CONFLICT_MODES = new Set<QuoteErrorStatusMode>([
  'accept',
  'decline',
]);

export function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function mapQuoteErrorStatus(
  code: string,
  mode: QuoteErrorStatusMode
): number {
  if (
    CONFLICT_CODES.has(code) ||
    (code === 'QUOTE_VERSION_CONFLICT' && VERSION_CONFLICT_MODES.has(mode)) ||
    (code === 'QUOTE_STOCK_UNAVAILABLE' && mode === 'accept')
  ) {
    return 409;
  }
  if (code === 'QUOTE_EXPIRED' && mode !== 'request') return 410;
  return 400;
}
