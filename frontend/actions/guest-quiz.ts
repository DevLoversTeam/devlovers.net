'use server';

import { db } from '@/db';
import {
  quizAttempts,
  quizAttemptAnswers,
  quizAnswers,
} from '@/db/schema/quiz';
import { awardQuizPoints } from '@/db/queries/points';

export interface SubmitGuestQuizInput {
  userId: string;
  quizId: string;
  answers: { questionId: string; selectedAnswerId: string; isCorrect: boolean }[];
  violations: { type: string; timestamp: number }[];
  timeSpentSeconds: number;
}

interface SubmitGuestQuizResult {
  success: boolean;
  error?: string;
  attemptId?: string;
  score?: number;
  totalQuestions?: number;
  percentage?: number;
  integrityScore?: number;
  pointsAwarded?: number;
}

export async function submitGuestQuizResult(
  input: SubmitGuestQuizInput
): Promise<SubmitGuestQuizResult> {
  console.log('[DEBUG] submitGuestQuizResult called with:', JSON.stringify(input));
  
  try {
    const { userId, quizId, answers, violations, timeSpentSeconds } = input;

    if (!userId || !quizId || !answers?.length) {
      return { success: false, error: 'Invalid input' };
    }

    const correctAnswersCount = answers.filter(a => a.isCorrect).length;
    const totalQuestions = answers.length;
    const percentage = ((correctAnswersCount / totalQuestions) * 100).toFixed(2);
    const integrityScore = Math.max(0, 100 - (violations?.length || 0) * 10);

    const now = new Date();
    const startedAt = new Date(now.getTime() - timeSpentSeconds * 1000);

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId,
        quizId,
        score: correctAnswersCount,
        totalQuestions,
        percentage,
        timeSpentSeconds,
        integrityScore,
        metadata: { violations: violations || [], isGuestResult: true },
        startedAt,
        completedAt: now,
      })
      .returning({ id: quizAttempts.id });

    await db.insert(quizAttemptAnswers).values(
      answers.map(a => ({
        attemptId: attempt.id,
        quizQuestionId: a.questionId,
        selectedAnswerId: a.selectedAnswerId,
        isCorrect: a.isCorrect,
        answeredAt: now,
      }))
    );

    const pointsAwarded = await awardQuizPoints({
      userId,
      quizId,
      attemptId: attempt.id,
      score: correctAnswersCount,
      integrityScore,
    });

    return {
      success: true,
      attemptId: attempt.id,
      score: correctAnswersCount,
      totalQuestions,
      percentage: parseFloat(percentage),
      integrityScore,
      pointsAwarded,
    };
  } catch (error) {
    console.error('[DEBUG] submitGuestQuizResult error:', error);
    return { success: false, error: 'Failed to save result' };
  }
}