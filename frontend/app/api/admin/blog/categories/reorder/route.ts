import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { swapBlogCategoryOrder } from '@/db/queries/blog/admin-blog';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { swapCategoryOrderSchema } from '@/lib/validation/admin-blog';

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

    const csrfResult = requireAdminCsrf(request, 'admin:blog-category:reorder');
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

    const parsed = swapCategoryOrderSchema.safeParse(rawBody);
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

    await swapBlogCategoryOrder(parsed.data.id1, parsed.data.id2);
    revalidatePath('/admin/blog/categories');

    return noStoreJson({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORIES_NOT_FOUND') {
      return noStoreJson(
        { error: 'One or both categories not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (error instanceof AdminApiDisabledError)
      return noStoreJson({ code: error.code }, { status: 403 });
    if (error instanceof AdminUnauthorizedError)
      return noStoreJson({ code: error.code }, { status: 401 });
    if (error instanceof AdminForbiddenError)
      return noStoreJson({ code: error.code }, { status: 403 });

    logError('admin_blog_category_reorder_failed', error, {});
    return noStoreJson(
      { error: 'Failed to reorder categories', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
