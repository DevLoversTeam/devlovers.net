import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import {
  deleteBlogPost,
  getAdminBlogPostById,
  toggleBlogPostPublish,
  updateBlogPost,
} from '@/db/queries/blog/admin-blog';
import { requireAdminApi } from '@/lib/auth/admin';
import {
  getAdminBlogAccessErrorResponse,
  readAdminBlogJson,
} from '@/lib/blog/admin-route-responses';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createBlogPostSchema } from '@/lib/validation/admin-blog';

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

    const csrfResult = requireAdminCsrf(request, 'admin:blog:update');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const { id } = await params;

    const body = await readAdminBlogJson(request);
    if (!body.ok) return body.response;

    const parsed = createBlogPostSchema.safeParse(body.data);
    if (!parsed.success) {
      return noStoreJson(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const existing = await getAdminBlogPostById(id);
    if (!existing) {
      return noStoreJson(
        { error: 'Post not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    await updateBlogPost(id, {
      slug: data.slug,
      authorId: data.authorId,
      mainImageUrl: data.mainImageUrl,
      mainImagePublicId: data.mainImagePublicId,
      tags: data.tags,
      resourceLink: data.resourceLink,
      translations: data.translations as Record<string, { title: string; body: unknown }>,
      categoryIds: data.categoryIds,
    });

    await toggleBlogPostPublish(id, {
      isPublished: data.publishMode === 'publish',
      scheduledPublishAt:
        data.publishMode === 'schedule' && data.scheduledPublishAt
          ? new Date(data.scheduledPublishAt)
          : null,
    });

    revalidatePath('/[locale]/blog', 'page');
    revalidatePath('/[locale]/blog/[slug]', 'page');
    revalidateTag('blog-authors', 'default');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_post_update_failed', error, {});
    return noStoreJson(
      { error: 'Failed to update post', code: 'INTERNAL_ERROR' },
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

    const csrfResult = requireAdminCsrf(request, 'admin:blog:delete');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const { id } = await params;

    const post = await getAdminBlogPostById(id);
    if (!post) {
      return noStoreJson(
        { error: 'Post not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (post.isPublished) {
      return noStoreJson(
        {
          error: 'Cannot delete a published post. Unpublish first.',
          code: 'PUBLISHED_POST',
        },
        { status: 400 }
      );
    }

    await deleteBlogPost(id);

    revalidatePath('/[locale]/blog', 'page');
    revalidateTag('blog-authors', 'default');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_post_delete_failed', error, {});
    return noStoreJson(
      { error: 'Failed to delete post', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const csrfResult = requireAdminCsrf(request, 'admin:blog:toggle-publish');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const { id } = await params;

    const post = await getAdminBlogPostById(id);
    if (!post) {
      return noStoreJson(
        { error: 'Post not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const newPublished = !post.isPublished;

    await toggleBlogPostPublish(id, {
      isPublished: newPublished,
      scheduledPublishAt: null,
    });

    revalidatePath('/[locale]/blog', 'page');
    revalidatePath('/[locale]/blog/[slug]', 'page');
    revalidateTag('blog-posts', 'default');

    return noStoreJson({
      success: true,
      isPublished: newPublished,
    });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_post_toggle_publish_failed', error, {});
    return noStoreJson(
      { error: 'Failed to toggle publish', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
