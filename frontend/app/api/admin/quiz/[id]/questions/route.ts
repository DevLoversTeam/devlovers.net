import { eq, inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import {
  insertQuizQuestionDetails,
  insertQuizQuestionRows,
} from '@/db/queries/quizzes/write-quiz-questions';
import { quizQuestions, quizzes } from '@/db/schema/quiz';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { noStoreJson } from '@/lib/http/noStoreJson';
import { logError } from '@/lib/logging';
import { invalidateQuizCache } from '@/lib/quiz/quiz-answers-redis';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { addQuestionsSchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
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

    const csrfResult = requireAdminCsrf(request, 'admin:quiz:questions:add');
    if (csrfResult) {
      csrfResult.headers.set('Cache-Control', 'no-store');
      return csrfResult;
    }

    const rawParams = await context.params;
    const parsedParams = paramsSchema.safeParse(rawParams);
    if (!parsedParams.success) {
      return noStoreJson(
        { error: 'Invalid params', code: 'INVALID_PARAMS' },
        { status: 400 }
      );
    }

    const { id: quizId } = parsedParams.data;

    const [quiz] = await db
      .select({ id: quizzes.id, status: quizzes.status })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return noStoreJson(
        { error: 'Quiz not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (quiz.status !== 'draft') {
      return noStoreJson(
        {
          error: 'Can only add questions to draft quizzes. Unpublish first.',
          code: 'NOT_DRAFT',
        },
        { status: 409 }
      );
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

    const parsed = addQuestionsSchema.safeParse(rawBody);
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

    const { questions } = parsed.data;

    const [maxRow] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(display_order), 0)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    const orderOffset = maxRow?.maxOrder ?? 0;

    const insertedQuestions = await insertQuizQuestionRows(
      quizId,
      questions,
      (_, index) => orderOffset + index + 1
    );

    try {
      await insertQuizQuestionDetails(insertedQuestions);
    } catch (insertError) {
      // Delete inserted questions — CASCADE removes content, answers, translations
      const questionIds = insertedQuestions.map(q => q.id);
      await db
        .delete(quizQuestions)
        .where(inArray(quizQuestions.id, questionIds));
      throw insertError;
    }
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    await db
      .update(quizzes)
      .set({ questionsCount: countRow.count })
      .where(eq(quizzes.id, quizId));

    await invalidateQuizCache(quizId);

    return noStoreJson({
      success: true,
      addedCount: questions.length,
      totalCount: countRow.count,
    });
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

    logError('admin_quiz_add_questions_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson(
      { error: 'Internal error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
