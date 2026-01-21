import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { logError } from '@/lib/logging';
import { restockStalePendingOrders } from '@/lib/services/orders';
import {
  CSRF_FORM_FIELD,
  isSameOrigin,
  verifyCsrfToken,
} from '@/lib/security/csrf';

const DEFAULT_STALE_MINUTES = 60;

export async function POST(request: NextRequest) {
  try {
    // 1) Kill-switch + auth FIRST (no body parsing)
    await requireAdminApi(request);

    // 2) CSRF checks second (browser-only semantics)
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        { code: 'CSRF_ORIGIN_MISMATCH' },
        { status: 403 }
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { code: 'INVALID_REQUEST_BODY' },
        { status: 400 }
      );
    }

    const token = form.get(CSRF_FORM_FIELD);
    if (
      typeof token !== 'string' ||
      !verifyCsrfToken(token, 'admin:orders:reconcile-stale')
    ) {
      return NextResponse.json({ code: 'CSRF_INVALID' }, { status: 403 });
    }

    const processed = await restockStalePendingOrders({
      olderThanMinutes: DEFAULT_STALE_MINUTES,
    });

    return NextResponse.json({ processed });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return NextResponse.json({ code: 'ADMIN_API_DISABLED' }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return NextResponse.json({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return NextResponse.json({ code: error.code }, { status: 403 });
    }

    logError('Failed to reconcile stale orders', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
