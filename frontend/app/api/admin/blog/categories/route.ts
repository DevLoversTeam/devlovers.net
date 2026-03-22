import { NextRequest, NextResponse } from 'next/server';

import { createBlogCategory } from '@/db/queries/blog/admin-blog';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createBlogCategorySchema } from '@/lib/validation/admin-blog';

export const runtime = 'nodejs';

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(
      request,
      'admin:blog-category:create'
    );
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const parsed = createBlogCategorySchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'Invalid payload',
          code: 'INVALID_PAYLOAD',
          details: parsed.error.format(),
        },
        { status: 400 }
      );
    }

    const category = await createBlogCategory(parsed.data);

    return noStoreJson({ success: true, category });
  } catch (error) {
    if (error instanceof AdminApiDisabledError)
      return noStoreJson({ code: error.code }, { status: 403 });
    if (error instanceof AdminUnauthorizedError)
      return noStoreJson({ code: error.code }, { status: 401 });
    if (error instanceof AdminForbiddenError)
      return noStoreJson({ code: error.code }, { status: 403 });

    logError('admin_blog_category_create_failed', error, {});
    return noStoreJson(
      { error: 'Failed to create category', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
