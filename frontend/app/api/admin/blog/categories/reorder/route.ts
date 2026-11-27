import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { swapBlogCategoryOrder } from '@/db/queries/blog/admin-blog';
import { requireAdminApi } from '@/lib/auth/admin';
import {
  getAdminBlogAccessErrorResponse,
  readAdminBlogJson,
} from '@/lib/blog/admin-route-responses';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { swapCategoryOrderSchema } from '@/lib/validation/admin-blog';

export const runtime = 'nodejs';

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

    const body = await readAdminBlogJson(request);
    if (!body.ok) return body.response;

    const parsed = swapCategoryOrderSchema.safeParse(body.data);
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
    revalidatePath('/[locale]/admin/blog/categories', 'page');
    revalidateTag('blog-categories', 'default');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORIES_NOT_FOUND') {
      return noStoreJson(
        { error: 'One or both categories not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_category_reorder_failed', error, {});
    return noStoreJson(
      { error: 'Failed to reorder categories', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
