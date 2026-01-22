import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError, logInfo, logWarn } from '@/lib/logging';
import { restockStalePendingOrders } from '@/lib/services/orders';
import {
  CSRF_FORM_FIELD,
  isSameOrigin,
  verifyCsrfToken,
} from '@/lib/security/csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const DEFAULT_STALE_MINUTES = 60;

export async function POST(request: NextRequest) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  // NOTE: We intentionally keep TWO origin checks:
  // 1) guardBrowserSameOrigin(): generic unsafe-request Origin allowlist gate
  //    (APP_ORIGIN/APP_ADDITIONAL_ORIGINS), fail-fast before auth/body parsing.
  // 2) isSameOrigin(): CSRF-specific strict same-origin assertion, so CSRF origin mismatch
  //    is logged/coded separately.
  // These checks are not equivalent and serve different error semantics (policy vs CSRF).

  const blocked = guardBrowserSameOrigin(request);

  if (blocked) {
    logWarn('admin_reconcile_stale_origin_blocked', {
      requestId,
      route: request.nextUrl.pathname,
      method: request.method,
      code: 'ORIGIN_BLOCKED',
      durationMs: Date.now() - startedAtMs,
    });
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };

  try {
    // 1) Kill-switch + auth FIRST (no body parsing)
    await requireAdminApi(request);

    // 2) CSRF checks second (browser-only semantics)
    if (!isSameOrigin(request)) {
      logWarn('admin_reconcile_stale_csrf_origin_mismatch', {
        ...baseMeta,
        code: 'CSRF_ORIGIN_MISMATCH',
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson({ code: 'CSRF_ORIGIN_MISMATCH' }, { status: 403 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (error) {
      logWarn('admin_reconcile_stale_invalid_body', {
        ...baseMeta,
        code: 'INVALID_REQUEST_BODY',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson({ code: 'INVALID_REQUEST_BODY' }, { status: 400 });
    }

    const token = form.get(CSRF_FORM_FIELD);
    if (
      typeof token !== 'string' ||
      !verifyCsrfToken(token, 'admin:orders:reconcile-stale')
    ) {
      logWarn('admin_reconcile_stale_csrf_invalid', {
        ...baseMeta,
        code: 'CSRF_INVALID',
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson({ code: 'CSRF_INVALID' }, { status: 403 });
    }

    const processed = await restockStalePendingOrders({
      olderThanMinutes: DEFAULT_STALE_MINUTES,
    });
    logInfo('admin_reconcile_stale_succeeded', {
      ...baseMeta,
      code: 'OK',
      processed,
      olderThanMinutes: DEFAULT_STALE_MINUTES,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson({ processed }, { status: 200 });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_reconcile_stale_admin_api_disabled', {
        ...baseMeta,
        code: 'ADMIN_API_DISABLED',
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: 'ADMIN_API_DISABLED' }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_reconcile_stale_unauthorized', {
        ...baseMeta,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      logWarn('admin_reconcile_stale_forbidden', {
        ...baseMeta,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_reconcile_stale_failed', error, {
      ...baseMeta,
      code: 'ADMIN_RECONCILE_STALE_FAILED',
      durationMs: Date.now() - startedAtMs,
    });
    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
