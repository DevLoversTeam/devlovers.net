import 'server-only';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { logError } from '@/lib/logging';
import { CSRF_FORM_FIELD, verifyCsrfToken } from '@/lib/security/csrf';

function readTokenFromForm(formData?: FormData): string | null {
  if (!formData) return null;
  const raw = formData.get(CSRF_FORM_FIELD);
  return typeof raw === 'string' ? raw.trim() : null;
}

function readTokenFromHeader(request: unknown): string | null {
  const headers = (request as any)?.headers;
  if (!headers || typeof headers.get !== 'function') return null;

  const raw = headers.get('x-csrf-token');
  return typeof raw === 'string' ? raw.trim() : null;
}

/**
 * Admin CSRF gate for cookie-based auth.
 * Token source:
 * - multipart/form-data: field CSRF_FORM_FIELD
 * - otherwise: header x-csrf-token
 *
 * Fail-closed:
 * - missing/invalid token => 403
 * - CSRF secret misconfigured => 503 (not 500)
 */
export function requireAdminCsrf(
  request: NextRequest,
  purpose: string,
  formData?: FormData
): NextResponse | null {
  const token = readTokenFromHeader(request) || readTokenFromForm(formData);

  if (!token) {
    return NextResponse.json({ code: 'CSRF_MISSING' }, { status: 403 });
  }

  try {
    const ok = verifyCsrfToken(token, purpose);
    if (!ok) {
      return NextResponse.json({ code: 'CSRF_INVALID' }, { status: 403 });
    }
    return null;
  } catch (err) {
    // e.g. CSRF_SECRET missing -> csrf.ts throws
    logError('CSRF verification failed (misconfigured)', err);
    return NextResponse.json({ code: 'CSRF_DISABLED' }, { status: 503 });
  }
}
