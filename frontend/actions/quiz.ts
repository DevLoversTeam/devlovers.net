'use server';

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { awardQuizPoints, calculateQuizPoints } from '@/db/queries/points';
import {
  quizAnswers,
  quizAttemptAnswers,
  quizAttempts,
  quizQuestions,
} from '@/db/schema/quiz';
import { getCurrentUser } from '@/lib/auth';
import { ACHIEVEMENTS, computeAchievements } from '@/lib/achievements';
import { getUserStatsForAchievements } from '@/lib/user-stats';
import { createNotification } from './notifications';

export interface UserAnswer {
  questionId: string;
  selectedAnswerId: string;
  answeredAt: Date;
}

export interface ViolationEvent {
  type: 'copy' | 'context-menu' | 'tab-switch' | 'paste';
  timestamp: Date;
}

export interface SubmitQuizAttemptInput {
  userId: string;
  quizId: string;
  answers: UserAnswer[];
  violations: ViolationEvent[];
  startedAt: Date;
  completedAt: Date;
  totalQuestions: number;
}

export interface SubmitQuizAttemptResult {
  success: boolean;
  attemptId?: string;
  score?: number;
  totalQuestions?: number;
  percentage?: number;
  integrityScore?: number;
  pointsAwarded?: number;
  error?: string;
}

function calculateIntegrityScore(violations: ViolationEvent[]): number {
  const penalty = violations.length * 10;
  return Math.max(0, 100 - penalty);
}

async function getQuizQuestionIds(quizId: string): Promise<string[]> {
  const rows = await db
    .select({ id: quizQuestions.id })
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId));

  return rows.map(r => r.id);
}

async function getAnswerRecords(answerIds: string[]) {
  if (answerIds.length === 0) return [];

  return db
    .select({
      id: quizAnswers.id,
      quizQuestionId: quizAnswers.quizQuestionId,
      isCorrect: quizAnswers.isCorrect,
    })
    .from(quizAnswers)
    .where(inArray(quizAnswers.id, answerIds));
}

export async function submitQuizAttempt(
  input: SubmitQuizAttemptInput
): Promise<SubmitQuizAttemptResult> {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return { success: false, error: 'Unauthorized' };
    }

    const { userId, quizId, answers, violations, startedAt, completedAt } =
      input;

    if (userId && userId !== session.id) {
      return { success: false, error: 'User mismatch' };
    }

    // Capture user achievements state BEFORE saving this attempt
    const statsBefore = await getUserStatsForAchievements(session.id);
    const earnedBefore = new Set(
      statsBefore
        ? computeAchievements(statsBefore)
            .filter(a => a.earned)
            .map(a => a.id)
        : []
    );

    if (!quizId || !Array.isArray(answers) || answers.length === 0) {
      return {
        success: false,
        error: 'Invalid input: quizId and answers are required',
      };
    }

    const questionIds = await getQuizQuestionIds(quizId);
    if (questionIds.length === 0) {
      return { success: false, error: 'Quiz not found' };
    }

    if (answers.length !== questionIds.length) {
      return {
        success: false,
        error: 'Invalid input: answers count mismatch',
      };
    }

    const questionIdSet = new Set(questionIds);
    const seenQuestionIds = new Set<string>();

    for (const answer of answers) {
      if (!questionIdSet.has(answer.questionId)) {
        return { success: false, error: 'Invalid question in answers' };
      }
      if (seenQuestionIds.has(answer.questionId)) {
        return { success: false, error: 'Duplicate answer for question' };
      }
      seenQuestionIds.add(answer.questionId);
    }

    const allAnswerIds = answers.map(a => a.selectedAnswerId);
    const answerRecords = await getAnswerRecords(allAnswerIds);

    if (answerRecords.length !== allAnswerIds.length) {
      return { success: false, error: 'Invalid answer selection' };
    }

    const answerById = new Map(answerRecords.map(r => [r.id, r]));
    let correctAnswersCount = 0;

    const answerResults = [];
    for (const answer of answers) {
      const record = answerById.get(answer.selectedAnswerId);
      if (!record || record.quizQuestionId !== answer.questionId) {
        return { success: false, error: 'Answer does not match question' };
      }

      const isCorrect = record.isCorrect;
      if (isCorrect) correctAnswersCount++;

      const answeredAt = new Date(answer.answeredAt);
      const safeAnsweredAt = Number.isNaN(answeredAt.getTime())
        ? new Date()
        : answeredAt;

      answerResults.push({
        questionId: answer.questionId,
        selectedAnswerId: answer.selectedAnswerId,
        isCorrect,
        answeredAt: safeAnsweredAt,
      });
    }

    const startedAtDate = new Date(startedAt);
    const completedAtDate = new Date(completedAt);

    if (
      Number.isNaN(startedAtDate.getTime()) ||
      Number.isNaN(completedAtDate.getTime())
    ) {
      return { success: false, error: 'Invalid time values' };
    }

    const percentage = (
      (correctAnswersCount / questionIds.length) *
      100
    ).toFixed(2);
    const integrityScore = calculateIntegrityScore(violations);
    const timeSpentSeconds = Math.floor(
      (completedAtDate.getTime() - startedAtDate.getTime()) / 1000
    );
    const pointsEarned = calculateQuizPoints({
      score: correctAnswersCount,
      integrityScore,
    });

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId: session.id,
        quizId,
        score: correctAnswersCount,
        totalQuestions: questionIds.length,
        percentage,
        timeSpentSeconds,
        pointsEarned,
        integrityScore,
        metadata: { violations },
        startedAt: startedAtDate,
        completedAt: completedAtDate,
      })
      .returning({ id: quizAttempts.id });

    if (answerResults.length > 0) {
      await db.insert(quizAttemptAnswers).values(
        answerResults.map(result => ({
          attemptId: attempt.id,
          quizQuestionId: result.questionId,
          selectedAnswerId: result.selectedAnswerId,
          isCorrect: result.isCorrect,
          answeredAt: result.answeredAt,
        }))
      );
    }

    const pointsAwarded = await awardQuizPoints({
      userId: session.id,
      quizId,
      attemptId: attempt.id,
      score: correctAnswersCount,
      integrityScore,
    });

    // Capture user achievements state AFTER saving this attempt
    const statsAfter = await getUserStatsForAchievements(session.id);
    if (statsAfter) {
      const earnedAfter = computeAchievements(statsAfter).filter(a => a.earned);
      const newlyEarned = earnedAfter.filter(a => !earnedBefore.has(a.id));

      // Trigger notifications for any newly earned achievements
      for (const achievement of newlyEarned) {
        // Find full object to get the fancy translated string (if needed) or just generic name
        await createNotification({
          userId: session.id,
          type: 'ACHIEVEMENT',
          title: 'Achievement Unlocked!',
          message: `You just earned the ${achievement.id} badge!`,
          metadata: { badgeId: achievement.id, icon: achievement.icon },
        });
      }
    }

    return {
      success: true,
      attemptId: attempt.id,
      score: correctAnswersCount,
      totalQuestions: questionIds.length,
      percentage: parseFloat(percentage),
      integrityScore,
      pointsAwarded,
    };
  } catch (error) {
    console.error('Error submitting quiz attempt:', error);
    return {
      success: false,
      error: 'Failed to submit quiz attempt',
    };
  }
}

export async function initializeQuizCache(
  quizId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getOrCreateQuizAnswersCache, clearVerifiedQuestions } =
      await import('@/lib/quiz/quiz-answers-redis');

    const { resolveRequestIdentifier } =
      await import('@/lib/quiz/resolve-identifier');
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const identifier = resolveRequestIdentifier(headersList);

    if (identifier) {
      await clearVerifiedQuestions(quizId, identifier);
    }

    const success = await getOrCreateQuizAnswersCache(quizId);

    if (!success) {
      return { success: false, error: 'Quiz not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to initialize quiz cache:', error);
    return { success: false, error: 'Internal server error' };
  }
}
