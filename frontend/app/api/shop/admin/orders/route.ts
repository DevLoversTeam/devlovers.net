import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';

import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';

import { getAdminOrdersPage } from '@/db/queries/shop/admin-orders';

import { logError, logWarn } from '@/lib/logging';

export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_orders_list_origin_blocked', {
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
    await requireAdminApi(request);

    const csrfRes = requireAdminCsrf(request, 'admin:orders:list');
    if (csrfRes) {
      logWarn('admin_orders_list_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const parsedQuery = querySchema.safeParse({
      limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      offset: request.nextUrl.searchParams.get('offset') ?? undefined,
    });

    if (!parsedQuery.success) {
      logWarn('admin_orders_list_invalid_query', {
        ...baseMeta,
        code: 'INVALID_QUERY',
        issuesCount: parsedQuery.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid query',
          code: 'INVALID_QUERY',
          details: parsedQuery.error.format(),
        },
        { status: 400 }
      );
    }

    const { items, total } = await getAdminOrdersPage(parsedQuery.data);

    return noStoreJson(
      {
        success: true,
        total,
        orders: items.map(o => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_orders_list_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_orders_list_unauthorized', {
        ...baseMeta,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }

    if (error instanceof AdminForbiddenError) {
      logWarn('admin_orders_list_forbidden', {
        ...baseMeta,
        code: error.code,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_orders_list_failed', error, {
      ...baseMeta,
      code: 'ADMIN_ORDERS_LIST_FAILED',
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
