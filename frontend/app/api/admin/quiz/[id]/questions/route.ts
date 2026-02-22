import { eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import {
  quizAnswers,
  quizAnswerTranslations,
  quizQuestionContent,
  quizQuestions,
  quizzes,
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
import { addQuestionsSchema } from '@/lib/validation/admin-quiz';

export const runtime = 'nodejs';

const LOCALES = ['en', 'uk', 'pl'] as const;

const paramsSchema = z.object({ id: z.string().uuid() });

function noStoreJson(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

function textToExplanationBlocks(text: string) {
  return [{ type: 'paragraph', children: [{ text }] }];
}

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
      return noStoreJson({ error: 'Invalid params', code: 'INVALID_PARAMS' }, { status: 400 });
    }

    const { id: quizId } = parsedParams.data;

    // Verify quiz exists and is draft
    const [quiz] = await db
      .select({ id: quizzes.id, status: quizzes.status })
      .from(quizzes)
      .where(eq(quizzes.id, quizId))
      .limit(1);

    if (!quiz) {
      return noStoreJson({ error: 'Quiz not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (quiz.status !== 'draft') {
      return noStoreJson(
        { error: 'Can only add questions to draft quizzes. Unpublish first.', code: 'NOT_DRAFT' },
        { status: 409 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return noStoreJson({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
    }

    const parsed = addQuestionsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return noStoreJson(
        { error: 'Invalid payload', code: 'INVALID_PAYLOAD', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { questions } = parsed.data;

    // Get current max displayOrder for offset
    const [maxRow] = await db
      .select({ maxOrder: sql<number>`COALESCE(MAX(display_order), 0)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));

    const orderOffset = maxRow?.maxOrder ?? 0;

    // 1. Insert questions
    const insertedQuestions = await db
      .insert(quizQuestions)
      .values(
        questions.map((q, i) => ({
          quizId,
          displayOrder: orderOffset + i + 1,
          difficulty: q.difficulty,
        }))
      )
      .returning({ id: quizQuestions.id });
    try {
      // 2. Insert question content
      await db.insert(quizQuestionContent).values(
        insertedQuestions.flatMap((dbQ, i) =>
          LOCALES.map(locale => ({
            quizQuestionId: dbQ.id,
            locale,
            questionText: questions[i][locale].q,
            explanation: textToExplanationBlocks(questions[i][locale].exp),
          }))
        )
      );

      // 3. Insert answers
      const answerValues = insertedQuestions.flatMap((dbQ, i) =>
        questions[i].answers.map((a, aIdx) => ({
          quizQuestionId: dbQ.id,
          displayOrder: aIdx + 1,
          isCorrect: a.correct,
        }))
      );

      const insertedAnswers = await db
        .insert(quizAnswers)
        .values(answerValues)
        .returning({ id: quizAnswers.id });

      // 4. Insert answer translations
      await db.insert(quizAnswerTranslations).values(
        insertedAnswers.flatMap((dbA, i) => {
          const qIdx = Math.floor(i / 4);
          const aIdx = i % 4;
          return LOCALES.map(locale => ({
            quizAnswerId: dbA.id,
            locale,
            answerText: questions[qIdx].answers[aIdx][locale],
          }));
        })
      );
    } catch(insertError) {
      // Delete inserted questions — CASCADE removes content, answers, translations
      const questionIds = insertedQuestions.map(q => q.id);
      await db.delete(quizQuestions).where(
        sql`${quizQuestions.id} IN ${questionIds}`
      );
      throw insertError;
    }
    // 5. Update questionsCount
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

    return noStoreJson({ error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
