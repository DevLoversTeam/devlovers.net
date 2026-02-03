import { eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { awardQuizPoints, calculateQuizPoints } from '@/db/queries/points';
import {
  quizAnswers,
  quizAttemptAnswers,
  quizAttempts,
  quizQuestions,
} from '@/db/schema/quiz';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json(
      { success: false, error: 'Invalid input' },
      { status: 400 }
    );
  }

  const { quizId, answers, violations, timeSpentSeconds } = body;

  if (!quizId || !Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Invalid input' },
      { status: 400 }
    );
  }

  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const userId = session.id;

  const questionRows = await db
    .select({ id: quizQuestions.id })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId));

  if (questionRows.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Quiz not found' },
      { status: 404 }
    );
  }

  if (answers.length !== questionRows.length) {
    return NextResponse.json(
      { success: false, error: 'Invalid input: answers count mismatch' },
      { status: 400 }
    );
  }

  const questionIdSet = new Set(questionRows.map(r => r.id));
  const seenQuestionIds = new Set<string>();
  const answerIds: string[] = [];

  for (const answer of answers) {
    if (!answer?.questionId || !answer?.selectedAnswerId) {
      return NextResponse.json(
        { success: false, error: 'Invalid answer payload' },
        { status: 400 }
      );
    }

    if (!questionIdSet.has(answer.questionId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid question in answers' },
        { status: 400 }
      );
    }

    if (seenQuestionIds.has(answer.questionId)) {
      return NextResponse.json(
        { success: false, error: 'Duplicate answer for question' },
        { status: 400 }
      );
    }

    seenQuestionIds.add(answer.questionId);
    answerIds.push(answer.selectedAnswerId);
  }

  const answerRows = await db
    .select({
      id: quizAnswers.id,
      quizQuestionId: quizAnswers.quizQuestionId,
      isCorrect: quizAnswers.isCorrect,
    })
    .from(quizAnswers)
    .where(inArray(quizAnswers.id, answerIds));

  if (answerRows.length !== answerIds.length) {
    return NextResponse.json(
      { success: false, error: 'Invalid answer selection' },
      { status: 400 }
    );
  }

  const answerById = new Map(answerRows.map(r => [r.id, r]));
  let correctAnswersCount = 0;

  const now = new Date();
  const attemptAnswers = [];

  for (const answer of answers) {
    const record = answerById.get(answer.selectedAnswerId);
    if (!record || record.quizQuestionId !== answer.questionId) {
      return NextResponse.json(
        { success: false, error: 'Answer does not match question' },
        { status: 400 }
      );
    }

    if (record.isCorrect) correctAnswersCount++;

    attemptAnswers.push({
      attemptId: '',
      quizQuestionId: answer.questionId,
      selectedAnswerId: answer.selectedAnswerId,
      isCorrect: record.isCorrect,
      answeredAt: now,
    });
  }

  const totalQuestions = questionRows.length;
  const percentage = ((correctAnswersCount / totalQuestions) * 100).toFixed(2);
  const violationsArray = Array.isArray(violations) ? violations : [];
  const integrityScore = Math.max(0, 100 - violationsArray.length * 10);
  const safeTimeSpentSeconds = Math.max(0, Number(timeSpentSeconds) || 0);
  const startedAt = new Date(now.getTime() - safeTimeSpentSeconds * 1000);

  const pointsEarned = calculateQuizPoints({
    score: correctAnswersCount,
    integrityScore,
  });

  try {
    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId,
        quizId,
        score: correctAnswersCount,
        totalQuestions,
        percentage,
        timeSpentSeconds: safeTimeSpentSeconds,
        integrityScore,
        pointsEarned,
        metadata: { violations: violationsArray, isGuestResult: true },
        startedAt,
        completedAt: now,
      })
      .returning({ id: quizAttempts.id });

    await db.insert(quizAttemptAnswers).values(
      attemptAnswers.map(a => ({
        ...a,
        attemptId: attempt.id,
      }))
    );

    const pointsAwarded = await awardQuizPoints({
      userId,
      quizId,
      attemptId: attempt.id,
      score: correctAnswersCount,
      integrityScore,
    });

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      score: correctAnswersCount,
      totalQuestions,
      percentage: parseFloat(percentage),
      integrityScore,
      pointsAwarded,
    });
  } catch (error) {
    console.error('Failed to save guest quiz result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save result' },
      { status: 500 }
    );
  }
}
