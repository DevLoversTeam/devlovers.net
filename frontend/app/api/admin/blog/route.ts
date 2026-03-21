import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  createBlogPost,
  toggleBlogPostPublish,
} from '@/db/queries/blog/admin-blog';
import { blogPosts } from '@/db/schema/blog';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createBlogPostSchema } from '@/lib/validation/admin-blog';

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

    const csrfResult = requireAdminCsrf(request, 'admin:blog:create');
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

    const parsed = createBlogPostSchema.safeParse(rawBody);
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

    // Check slug uniqueness
    const [existing] = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.slug, data.slug))
      .limit(1);

    if (existing) {
      return noStoreJson(
        { error: 'Slug already exists', code: 'DUPLICATE_SLUG' },
        { status: 409 }
      );
    }

    const postId = await createBlogPost({
      slug: data.slug,
      authorId: data.authorId,
      mainImageUrl: data.mainImageUrl,
      mainImagePublicId: data.mainImagePublicId,
      tags: data.tags,
      resourceLink: data.resourceLink,
      translations: data.translations as Record<string, { title: string; body: unknown }>,
      categoryIds: data.categoryIds,
    });

    // Apply publish state if not draft
    if (data.publishMode !== 'draft') {
      await toggleBlogPostPublish(postId, {
        isPublished: data.publishMode === 'publish',
        scheduledPublishAt:
          data.publishMode === 'schedule' && data.scheduledPublishAt
            ? new Date(data.scheduledPublishAt)
            : null,
      });
    }
    revalidateTag('blog-posts', 'default')

    return noStoreJson({ success: true, postId });
  } catch (error) {
    if (error instanceof AdminApiDisabledError)
      return noStoreJson({ code: error.code }, { status: 403 });
    if (error instanceof AdminUnauthorizedError)
      return noStoreJson({ code: error.code }, { status: 401 });
    if (error instanceof AdminForbiddenError)
      return noStoreJson({ code: error.code }, { status: 403 });

    logError('admin_blog_post_create_failed', error, {});
    return noStoreJson(
      { error: 'Failed to create post', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
