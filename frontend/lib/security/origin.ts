import { NextRequest, NextResponse } from 'next/server';

const LOCALHOST_ORIGIN = 'http://localhost:3000';

function buildErrorResponse(
  code: string,
  message: string,
  extraBody?: Record<string, unknown>,
  extraError?: Record<string, unknown>
) {
  const safeBody = extraBody ? { ...extraBody } : undefined;
  if (safeBody && 'error' in safeBody) {
    delete (safeBody as Record<string, unknown>).error;
  }

  const safeError = extraError ? { ...extraError } : undefined;
  if (safeError) {
    delete (safeError as Record<string, unknown>).code;
    delete (safeError as Record<string, unknown>).message;
  }
  const res = NextResponse.json(
    {
      error: {
        code,
        message,
        ...(safeError ?? {}),
      },

      ...(safeBody ?? {}),
    },
    { status: 403 }
  );

  res.headers.set('Cache-Control', 'no-store');

  return res;
}

export function normalizeOrigin(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');

  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

export function getAllowedOrigins(): string[] {
  const allowed = new Set<string>();

  const appOrigin = (process.env.APP_ORIGIN ?? '').trim();
  if (appOrigin) {
    const normalized = normalizeOrigin(appOrigin);
    if (normalized) allowed.add(normalized);
  }

  const additionalRaw = (process.env.APP_ADDITIONAL_ORIGINS ?? '').trim();
  if (additionalRaw) {
    for (const entry of additionalRaw.split(',')) {
      const candidate = entry.trim();
      if (!candidate) continue;
      const normalized = normalizeOrigin(candidate);
      if (normalized) allowed.add(normalized);
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const normalizedLocalhost = normalizeOrigin(LOCALHOST_ORIGIN);
    if (!allowed.has(normalizedLocalhost)) {
      allowed.add(normalizedLocalhost);
    }
  }

  return Array.from(allowed.values());
}

export function guardBrowserSameOrigin(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return null;

  const origin = req.headers.get('origin');
  if (!origin) {
    return buildErrorResponse(
      'ORIGIN_NOT_ALLOWED',
      'Origin header is required for unsafe requests.'
    );
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins();
  const isAllowed = allowedOrigins.includes(normalizedOrigin);

  if (!isAllowed) {
    return buildErrorResponse(
      'ORIGIN_NOT_ALLOWED',
      'Origin is not allowed for this endpoint.'
    );
  }

  return null;
}

export function guardNonBrowserOnly(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  if (origin) {
    return buildErrorResponse(
      'BROWSER_CONTEXT_NOT_ALLOWED',
      'Browser context is not allowed for this endpoint.'
    );
  }

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'none') {
    return buildErrorResponse(
      'BROWSER_CONTEXT_NOT_ALLOWED',
      'Browser context is not allowed for this endpoint.'
    );
  }

  return null;
}

function hasAnySecFetchHeader(req: NextRequest): boolean {
  for (const key of req.headers.keys()) {
    if (key.toLowerCase().startsWith('sec-fetch-')) {
      return true;
    }
  }
  return false;
}

export function guardNonBrowserFailClosed(
  req: NextRequest,
  meta?: { surface?: string }
): NextResponse | null {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const hasSecFetch = hasAnySecFetchHeader(req);

  if (!origin && !referer && !hasSecFetch) {
    return null;
  }

  return buildErrorResponse(
    'ORIGIN_BLOCKED',
    'Browser context is not allowed for this endpoint.',
    { surface: meta?.surface ?? 'non_browser' }
  );
}
