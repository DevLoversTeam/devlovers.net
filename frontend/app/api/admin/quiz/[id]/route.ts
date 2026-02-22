import { count, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { quizAttempts, quizzes, quizTranslations } from '@/db/schema/quiz';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { invalidateQuizCache } from '@/lib/quiz/quiz-answers-redis';
import { validateQuizForPublish } from '@/lib/validation/quiz-publish-validation';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { patchQuizSchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:quiz:update');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return noStoreJson({ error: 'Invalid params', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    const { id: quizId } = parsedParams.data;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
    }

    const parsed = patchQuizSchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson(
        { error: 'Invalid payload', code: 'INVALID_PAYLOAD', details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Verify quiz exists
    const [quiz] = await db
      .select({ id: quizzes.id, status: quizzes.status })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return noStoreJson({ error: 'Quiz not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { status, isActive } = parsed.data;

    // Publish validation: draft -> ready
    if (status === 'ready' && quiz.status !== 'ready') {
      const validationErrors = await validateQuizForPublish(quizId);
      if (validationErrors.length > 0) {
        return noStoreJson(
          { error: 'Quiz is not ready for publishing', code: 'PUBLISH_VALIDATION_FAILED', details: validationErrors },
          { status: 422 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (parsed.data.timeLimitSeconds !== undefined) updateData.timeLimitSeconds = parsed.data.timeLimitSeconds;

    await db.update(quizzes).set(updateData).where(eq(quizzes.id, quizId));
    const { translations } = parsed.data;
    if (translations) {
      const locales = ['en', 'uk', 'pl'] as const;
      for (const locale of locales) {
        await db
          .insert(quizTranslations)
          .values({
            quizId,
            locale,
            title: translations[locale].title,
            description: translations[locale].description,
          })
          .onConflictDoUpdate({
            target: [quizTranslations.quizId, quizTranslations.locale],
            set: {
              title: translations[locale].title,
              description: translations[locale].description,
            },
          });
      }
    }

    await invalidateQuizCache(quizId);

    return noStoreJson({ success: true, quiz: { id: quizId, status: status ?? quiz.status, isActive } });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_quiz_patch_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:quiz:delete');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return noStoreJson({ error: 'Invalid params', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    const { id: quizId } = parsedParams.data;

    const [quiz] = await db
      .select({
        id: quizzes.id,
        status: quizzes.status,
        isActive: quizzes.isActive,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return noStoreJson({ error: 'Quiz not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (quiz.status !== 'draft') {
      return noStoreJson(
        { error: 'Only draft quizzes can be deleted', code: 'NOT_DRAFT' },
        { status: 409 }
      );
    }

    if (quiz.isActive) {
      return noStoreJson(
        { error: 'Deactivate the quiz before deleting', code: 'STILL_ACTIVE' },
        { status: 409 }
      );
    }

    const [{ total }] = await db
      .select({ total: count() })
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quizId));

    if (total > 0) {
      return noStoreJson(
        { error: `Cannot delete: ${total} attempt(s) exist`, code: 'HAS_ATTEMPTS' },
        { status: 409 }
      );
    }

    await db.delete(quizzes).where(eq(quizzes.id, quizId));

    await invalidateQuizCache(quizId);

    return noStoreJson({ success: true });
  } catch (error) {
    if (error instanceof AdminApiDisabledError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }
    if (error instanceof AdminUnauthorizedError) {
      return noStoreJson({ code: error.code }, { status: 401 });
    }
    if (error instanceof AdminForbiddenError) {
      return noStoreJson({ code: error.code }, { status: 403 });
    }

    logError('admin_quiz_delete_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
