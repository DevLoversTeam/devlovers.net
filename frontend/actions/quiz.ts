'use server';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { awardQuizPoints, calculateQuizPoints } from '@/db/queries/points';
import {
  quizAnswers,
  quizAttemptAnswers,
  quizAttempts,
  quizQuestions,
} from '@/db/schema/quiz';
import { getCurrentUser } from '@/lib/auth';

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

function validateTimeSpent(
  startedAt: Date,
  completedAt: Date,
  questionCount: number
): boolean {
  const MIN_SECONDS_PER_QUESTION = 1;
  const timeSpentSeconds = Math.floor(
    (completedAt.getTime() - startedAt.getTime()) / 1000
  );
  const minRequiredTime = questionCount * MIN_SECONDS_PER_QUESTION;

  return timeSpentSeconds >= minRequiredTime;
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

    const isValidTime = validateTimeSpent(
      startedAtDate,
      completedAtDate,
      questionIds.length
    );
    if (!isValidTime) {
      return {
        success: false,
        error: 'Invalid time spent: quiz completed too quickly',
      };
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
