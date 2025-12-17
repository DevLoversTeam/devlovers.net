import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { logError } from '@/lib/logging';
import { restockStalePendingOrders } from '@/lib/services/orders';

const DEFAULT_STALE_MINUTES = 60;

export async function POST(request: NextRequest) {
  try {
    await requireAdminApi(request);
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
