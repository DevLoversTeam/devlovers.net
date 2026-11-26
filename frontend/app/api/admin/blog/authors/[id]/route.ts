import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { deleteBlogAuthor, updateBlogAuthor } from '@/db/queries/blog/admin-blog';
import { requireAdminApi } from '@/lib/auth/admin';
import {
  getAdminBlogAccessErrorResponse,
  readAdminBlogJson,
} from '@/lib/blog/admin-route-responses';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { updateBlogAuthorSchema } from '@/lib/validation/admin-blog';

export const runtime = 'nodejs';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:blog-author:update');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const { id } = await params;

    const body = await readAdminBlogJson(request);
    if (!body.ok) return body.response;

    const parsed = updateBlogAuthorSchema.safeParse(body.data);
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

    await updateBlogAuthor(id, parsed.data);
    revalidatePath('/[locale]/admin/blog/authors', 'page');
    revalidatePath('/[locale]/blog', 'page');
    revalidatePath('/[locale]/blog/[slug]', 'page');
    revalidateTag('blog-authors', 'default');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_author_update_failed', error, {});
    return noStoreJson(
      { error: 'Failed to update author', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:blog-author:delete');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const { id } = await params;
    await deleteBlogAuthor(id);
    revalidatePath('/[locale]/admin/blog/authors', 'page');
    revalidatePath('/[locale]/blog', 'page');
    revalidatePath('/[locale]/blog/[slug]', 'page');
    revalidateTag('blog-authors', 'default');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'AUTHOR_HAS_POSTS') {
      return noStoreJson(
        { error: 'Author has posts assigned', code: 'HAS_POSTS' },
        { status: 409 }
      );
    }

    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_author_delete_failed', error, {});
    return noStoreJson(
      { error: 'Failed to delete author', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
