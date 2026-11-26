import { NextRequest } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { getRequestId } from '@/lib/http/getRequestId';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError, logWarn } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { InvalidPayloadError } from '@/lib/services/errors';
import { receiveReturnRequest } from '@/lib/services/shop/returns';
import { returnRequestIdParamSchema } from '@/lib/validation/shop-returns';

import {
  invalidReturnPayloadResponse,
  serializeReturnRequest,
} from '../_shared';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request.headers);
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
    const csrfRes = requireAdminCsrf(request, 'admin:returns:receive');
    if (csrfRes) {
      csrfRes.headers.set('Cache-Control', 'no-store');
      return csrfRes;
    }

    const parsed = returnRequestIdParamSchema.safeParse(await context.params);
    if (!parsed.success) {
      return noStoreJson({ code: 'INVALID_RETURN_ID' }, { status: 400 });
    }
    returnRequestIdForLog = parsed.data.id;

    const result = await receiveReturnRequest({
      returnRequestId: returnRequestIdForLog,
      actorUserId: typeof admin.id === 'string' ? admin.id : null,
      requestId,
    });

    return noStoreJson({
      success: true,
      changed: result.changed,
      returnRequest: serializeReturnRequest(result.row),
    });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson({ code: 'ADMIN_API_DISABLED' }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof InvalidPayloadError) {
      logWarn('admin_return_receive_rejected', {
        ...baseMeta,
        returnRequestId: returnRequestIdForLog,
        code: error.code,
      });
      return invalidReturnPayloadResponse(error);
    }
    logError('admin_return_receive_failed', error, {
      ...baseMeta,
      returnRequestId: returnRequestIdForLog,
      code: 'ADMIN_RETURN_RECEIVE_FAILED',
    });
    return noStoreJson({ code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
