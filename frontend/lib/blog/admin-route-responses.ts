import type { NextResponse } from 'next/server';

import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
} from '@/lib/auth/admin';
import { noStoreJson } from '@/lib/http/noStoreJson';

export function getAdminBlogAccessErrorResponse(
  error: unknown
): NextResponse | null {
  if (error instanceof AdminApiDisabledError)
    return noStoreJson({ code: error.code }, { status: 403 });
  if (error instanceof AdminUnauthorizedError)
    return noStoreJson({ code: error.code }, { status: 401 });
  if (error instanceof AdminForbiddenError)
    return noStoreJson({ code: error.code }, { status: 403 });

  return null;
}

export async function readAdminBlogJson(
  request: Request
): Promise<
  { ok: true; data: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: noStoreJson(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' },
        { status: 400 }
      ),
    };
  }
}
