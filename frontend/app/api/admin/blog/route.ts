import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  createBlogPost,
  toggleBlogPostPublish,
} from '@/db/queries/blog/admin-blog';
import { blogPosts } from '@/db/schema/blog';
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

    let postId: string;
      try {
        postId = await createBlogPost({
          slug: data.slug,
          authorId: data.authorId,
          mainImageUrl: data.mainImageUrl,
          mainImagePublicId: data.mainImagePublicId,
          tags: data.tags,
          resourceLink: data.resourceLink,
          translations: data.translations as Record<string, { title: string; body: unknown }>,
          categoryIds: data.categoryIds,
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes('duplicate key')) {
          return noStoreJson(
            { error: 'Slug already exists', code: 'DUPLICATE_SLUG' },
            { status: 409 }
          );
        }
        throw err;
      }

    if (data.publishMode !== 'draft') {
      await toggleBlogPostPublish(postId, {
        isPublished: data.publishMode === 'publish',
        scheduledPublishAt:
          data.publishMode === 'schedule' && data.scheduledPublishAt
            ? new Date(data.scheduledPublishAt)
            : null,
      });
    }
    revalidateTag('blog-posts', 'default');

    return noStoreJson({ success: true, postId });
  } catch (error) {
    const accessError = getAdminBlogAccessErrorResponse(error);
    if (accessError) return accessError;

    logError('admin_blog_post_create_failed', error, {});
    return noStoreJson(
      { error: 'Failed to create post', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
