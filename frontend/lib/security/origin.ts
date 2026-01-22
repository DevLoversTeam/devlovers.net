import { NextRequest, NextResponse } from 'next/server';

const LOCALHOST_ORIGIN = 'http://localhost:3000';

function buildErrorResponse(code: string, message: string) {
  const res = NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status: 403 }
  );

  // Ensure security errors are never cached by intermediaries.
  res.headers.set('Cache-Control', 'no-store');

  return res;
}

export function normalizeOrigin(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');

  try {
    // If the input is a valid URL (incl. scheme), normalize to canonical origin.
    return new URL(trimmed).origin;
  } catch {
    // Backward-compatible fallback for values like "example.com" (no scheme).
    return trimmed;
  }
}

export function getAllowedOrigins(): string[] {
  const allowed = new Set<string>();

  const appOrigin = (process.env.APP_ORIGIN ?? '').trim();
  if (appOrigin) {
    allowed.add(normalizeOrigin(appOrigin));
  }

  const additionalRaw = (process.env.APP_ADDITIONAL_ORIGINS ?? '').trim();
  if (additionalRaw) {
    for (const entry of additionalRaw.split(',')) {
      const candidate = entry.trim();
      if (!candidate) continue;
      allowed.add(normalizeOrigin(candidate));
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
