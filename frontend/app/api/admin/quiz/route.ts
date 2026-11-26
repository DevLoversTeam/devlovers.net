import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { getMaxQuizDisplayOrder } from '@/db/queries/categories/admin-categories';
import {
  insertQuizQuestionDetails,
  insertQuizQuestionRows,
} from '@/db/queries/quizzes/write-quiz-questions';
import { quizTranslations, quizzes } from '@/db/schema/quiz';
import { locales } from '@/i18n/config';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { createQuizSchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:quiz:create');
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

    const parsed = createQuizSchema.safeParse(rawBody);
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

    const { categoryId, slug, timeLimitSeconds, translations, questions } =
      parsed.data;

    // Check duplicate slug within category
    const [existing] = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(and(eq(quizzes.categoryId, categoryId), eq(quizzes.slug, slug)))
      .limit(1);

    if (existing) {
      return noStoreJson(
        {
          error: 'Quiz with this slug already exists in this category',
          code: 'DUPLICATE_SLUG',
        },
        { status: 409 }
      );
    }

    // Auto-assign displayOrder
    const maxOrder = await getMaxQuizDisplayOrder(categoryId);
    const displayOrder = maxOrder + 1;

    // 1. Insert quiz
    const [quiz] = await db
      .insert(quizzes)
      .values({
        categoryId,
        slug,
        displayOrder,
        questionsCount: questions.length,
        timeLimitSeconds: timeLimitSeconds ?? null,
        isActive: false,
        status: 'draft',
      })
      .returning({ id: quizzes.id });

    const quizId = quiz.id;

    try {
      // 2. Insert quiz translations
      await db.insert(quizTranslations).values(
        locales.map(locale => ({
          quizId,
          locale,
          title: translations[locale].title,
          description: translations[locale].description,
        }))
      );

      const insertedQuestions = await insertQuizQuestionRows(
        quizId,
        questions,
        question => question.order
      );
      await insertQuizQuestionDetails(insertedQuestions);
    } catch (insertError) {
      // Delete quiz — CASCADE removes translations, questions, content, answers, answer translations
      await db.delete(quizzes).where(eq(quizzes.id, quizId));
      throw insertError;
    }

    return noStoreJson({ success: true, quizId });
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

    logError('admin_quiz_create_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson(
      { error: 'Internal error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
