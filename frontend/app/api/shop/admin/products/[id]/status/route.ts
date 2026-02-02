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

import { logError, logWarn } from '@/lib/logging';
import { ProductNotFoundError } from '@/lib/errors/products';
import { toggleProductStatus } from '@/lib/services/products';

export const runtime = 'nodejs';

const productIdParamSchema = z.object({ id: z.string().uuid() });
function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startedAtMs = Date.now();

  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    logWarn('admin_product_status_origin_blocked', {
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

  let productIdForLog: string | null = null;

  try {
    await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:products:status');
    if (csrfRes) {
      logWarn('admin_product_status_csrf_rejected', {
        ...baseMeta,
        code: 'CSRF_REJECTED',
        durationMs: Date.now() - startedAtMs,
      });
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const rawParams = await context.params;
    const parsedParams = productIdParamSchema.safeParse(rawParams);

    if (!parsedParams.success) {
      logWarn('admin_product_status_invalid_product_id', {
        ...baseMeta,
        code: 'INVALID_PRODUCT_ID',
        issuesCount: parsedParams.error.issues?.length ?? 0,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        {
          error: 'Invalid product id',
          code: 'INVALID_PRODUCT_ID',
          details: parsedParams.error.format(),
        },
        { status: 400 }
      );
    }

    productIdForLog = parsedParams.data.id;

    const updated = await toggleProductStatus(productIdForLog);

    return noStoreJson({ success: true, product: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      logWarn('admin_product_status_admin_api_disabled', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      logWarn('admin_product_status_unauthorized', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      logWarn('admin_product_status_forbidden', {
        ...baseMeta,
        code: error.code,
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    if (error instanceof ProductNotFoundError) {
      logWarn('admin_product_status_not_found', {
        ...baseMeta,
        code: 'PRODUCT_NOT_FOUND',
        productId: productIdForLog,
        durationMs: Date.now() - startedAtMs,
      });

      return noStoreJson(
        { error: 'Product not found', code: 'PRODUCT_NOT_FOUND' },
        { status: 404 }
      );
    }

    logError('admin_product_status_failed', error, {
      ...baseMeta,
      code: 'ADMIN_PRODUCT_STATUS_FAILED',
      productId: productIdForLog,
      durationMs: Date.now() - startedAtMs,
    });

    return noStoreJson(
      { error: 'internal_error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
