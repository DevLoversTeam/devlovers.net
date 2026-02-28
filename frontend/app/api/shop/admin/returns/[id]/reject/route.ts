import crypto from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError, logWarn } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { InvalidPayloadError } from '@/lib/services/errors';
import { rejectReturnRequest } from '@/lib/services/shop/returns';
import { returnRequestIdParamSchema } from '@/lib/validation/shop-returns';

function noStoreJson(body: unknown, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function mapInvalidPayloadStatus(code: string): number {
  if (code === 'RETURN_NOT_FOUND') return 404;
  if (code === 'RETURN_TRANSITION_INVALID') return 409;
  return 400;
}

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId =
    request.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const baseMeta = {
    requestId,
    route: request.nextUrl.pathname,
    method: request.method,
  };
  let returnRequestIdForLog: string | null = null;

  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    const admin = await requireAdminApi(request);
    const csrfRes = requireAdminCsrf(request, 'admin:returns:reject');
    if (csrfRes) {
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const parsed = returnRequestIdParamSchema.safeParse(await context.params);
    if (!parsed.success) {
      return noStoreJson({ code: 'INVALID_RETURN_ID' }, 400);
    }
    returnRequestIdForLog = parsed.data.id;

    const result = await rejectReturnRequest({
      returnRequestId: returnRequestIdForLog,
      actorUserId: typeof admin.id === 'string' ? admin.id : null,
      requestId,
    });

    return noStoreJson({
      success: true,
      changed: result.changed,
      returnRequest: {
        ...result.row,
        approvedAt: result.row.approvedAt?.toISOString() ?? null,
        rejectedAt: result.row.rejectedAt?.toISOString() ?? null,
        receivedAt: result.row.receivedAt?.toISOString() ?? null,
        refundedAt: result.row.refundedAt?.toISOString() ?? null,
        createdAt: result.row.createdAt.toISOString(),
        updatedAt: result.row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson({ code: 'ADMIN_API_DISABLED' }, 403);
    }
    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code }, 401);
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code }, 403);
    }
    if (error instanceof InvalidPayloadError) {
      logWarn('admin_return_reject_rejected', {
        ...baseMeta,
        returnRequestId: returnRequestIdForLog,
        code: error.code,
      });
      return noStoreJson(
        {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        mapInvalidPayloadStatus(error.code)
      );
    }
    logError('admin_return_reject_failed', error, {
      ...baseMeta,
      returnRequestId: returnRequestIdForLog,
      code: 'ADMIN_RETURN_REJECT_FAILED',
    });
    return noStoreJson({ code: 'INTERNAL_ERROR' }, 500);
  }
}
