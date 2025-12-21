'use server';

import { db } from '@/db';
import {
  quizAttempts,
  quizAttemptAnswers,
  quizAnswers,
} from '@/db/schema/quiz';
import { awardQuizPoints } from '@/db/queries/points';
import { eq } from 'drizzle-orm';

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

async function isAnswerCorrect(answerId: string): Promise<boolean> {
  const answer = await db
    .select({ isCorrect: quizAnswers.isCorrect })
    .from(quizAnswers)
    .where(eq(quizAnswers.id, answerId))
    .limit(1);

  return answer.length > 0 && answer[0].isCorrect;
}

export async function submitQuizAttempt(
  input: SubmitQuizAttemptInput
): Promise<SubmitQuizAttemptResult> {
  try {
    const { userId, quizId, answers, violations, startedAt, completedAt } =
      input;

    if (!userId || !quizId || !answers.length) {
      return {
        success: false,
        error: 'Invalid input: userId, quizId, and answers are required',
      };
    }

    const isValidTime = validateTimeSpent(
      startedAt,
      completedAt,
      answers.length
    );
    if (!isValidTime) {
      return {
        success: false,
        error: 'Invalid time spent: quiz completed too quickly',
      };
    }

    let correctAnswersCount = 0;

    const answerResults = await Promise.all(
      answers.map(async answer => {
        const isCorrect = await isAnswerCorrect(answer.selectedAnswerId);
        if (isCorrect) correctAnswersCount++;
        return {
          questionId: answer.questionId,
          selectedAnswerId: answer.selectedAnswerId,
          isCorrect,
          answeredAt: answer.answeredAt,
        };
      })
    );

    const totalQuestions = answers.length;
    const percentage = ((correctAnswersCount / totalQuestions) * 100).toFixed(
      2
    );
    const integrityScore = calculateIntegrityScore(violations);
    const timeSpentSeconds = Math.floor(
      (completedAt.getTime() - startedAt.getTime()) / 1000
    );

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
        metadata: { violations },
        startedAt,
        completedAt,
      })
      .returning({ id: quizAttempts.id });

    await db.insert(quizAttemptAnswers).values(
      answerResults.map(result => ({
        attemptId: attempt.id,
        quizQuestionId: result.questionId,
        selectedAnswerId: result.selectedAnswerId,
        isCorrect: result.isCorrect,
        answeredAt: result.answeredAt,
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
    console.error('Error submitting quiz attempt:', error);
    return {
      success: false,
      error: 'Failed to submit quiz attempt',
    };
  }
}

