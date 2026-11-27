import { NextRequest, NextResponse } from 'next/server';

import { createBlogAuthor } from '@/db/queries/blog/admin-blog';
import { requireAdminApi } from '@/lib/auth/admin';
import {
  getAdminBlogAccessErrorResponse,
  readAdminBlogJson,
} from '@/lib/blog/admin-route-responses';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createBlogAuthorSchema } from '@/lib/validation/admin-blog';

export const runtime = 'nodejs';

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
      'admin:blog-author:create'
    );
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const body = await readAdminBlogJson(request);
    if (!body.ok) return body.response;

    const parsed = createBlogAuthorSchema.safeParse(body.data);
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

    const author = await createBlogAuthor(parsed.data);

    return noStoreJson({ success: true, author });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_author_create_failed', error, {});
    return noStoreJson(
      { error: 'Failed to create author', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
