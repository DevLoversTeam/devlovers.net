import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
} from '@/db/schema/quiz';
import {
  AdminApiDisabledError,
  AdminForbiddenError,
  AdminUnauthorizedError,
  requireAdminApi,
} from '@/lib/auth/admin';
import { logError } from '@/lib/logging';
import { invalidateQuizCache } from '@/lib/quiz/quiz-answers-redis';
import { requireAdminCsrf } from '@/lib/security/admin-csrf';
import { guardBrowserSameOrigin } from '@/lib/security/origin';
import { patchQuestionSchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

const paramsSchema = z.object({
  id: z.string().uuid(),
  questionId: z.string().uuid(),
});

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; questionId: string }> }
): Promise<NextResponse> {
  const blocked = guardBrowserSameOrigin(request);
  if (blocked) {
    blocked.headers.set('Cache-Control', 'no-store');
    return blocked;
  }

  try {
    await requireAdminApi(request);

    const csrfResult = requireAdminCsrf(request, 'admin:quiz:question:update');
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

    const { id: quizId, questionId } = parsedParams.data;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson(
        { error: 'Invalid JSON body', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const parsed = patchQuestionSchema.safeParse(rawBody);
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

    const { dirtyLocales, translations, answers } = parsed.data;

    // Verify questionId belongs to quizId — prevents cross-quiz edits via URL manipulation
    const [question] = await db
      .select({ id: quizQuestions.id })
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.id, questionId),
          eq(quizQuestions.quizId, quizId)
        )
      )
      .limit(1);

    if (!question) {
      return noStoreJson(
        { error: 'Question not found', code: 'QUESTION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Verify all submitted answer IDs belong to this question
    const dbAnswers = await db
      .select({ id: quizAnswers.id })
      .from(quizAnswers)
      .where(eq(quizAnswers.quizQuestionId, questionId));

    const dbAnswerIds = new Set(dbAnswers.map(a => a.id));
    const allValid = answers.every(a => dbAnswerIds.has(a.id));

    if (!allValid) {
      return noStoreJson(
        {
          error: 'One or more answers do not belong to this question',
          code: 'INVALID_ANSWER_IDS',
        },
        { status: 422 }
      );
    }

    // Upsert question text + explanation for dirty locales only
    await Promise.all(
      dirtyLocales.map(locale =>
        db
          .insert(quizQuestionContent)
          .values({
            quizQuestionId: questionId,
            locale,
            questionText: translations[locale].questionText,
            explanation: translations[locale].explanation,
          })
          .onConflictDoUpdate({
            target: [
              quizQuestionContent.quizQuestionId,
              quizQuestionContent.locale,
            ],
            set: {
              questionText: translations[locale].questionText,
              explanation: translations[locale].explanation,
            },
          })
      )
    );

    // Update isCorrect per answer — locale-independent, one flag per answer
    await Promise.all(
      answers.map(answer =>
        db
          .update(quizAnswers)
          .set({ isCorrect: answer.isCorrect })
          .where(
            and(
              eq(quizAnswers.id, answer.id),
              eq(quizAnswers.quizQuestionId, questionId)
            )
          )
      )
    );

    // Upsert answer text translations for dirty locales only
    await Promise.all(
      dirtyLocales.flatMap(locale =>
        answers.map(answer =>
          db
            .insert(quizAnswerTranslations)
            .values({
              quizAnswerId: answer.id,
              locale,
              answerText: answer.translations[locale].answerText,
            })
            .onConflictDoUpdate({
              target: [
                quizAnswerTranslations.quizAnswerId,
                quizAnswerTranslations.locale,
              ],
              set: {
                answerText: answer.translations[locale].answerText,
              },
            })
        )
      )
    );

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

    logError('admin_quiz_question_patch_failed', error, {
      route: request.nextUrl.pathname,
      method: request.method,
    });

    return noStoreJson(
      { error: 'Internal error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
