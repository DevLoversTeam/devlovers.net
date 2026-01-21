import { revalidateTag } from 'next/cache';
import { db } from '../index';
import { pointTransactions } from '../schema/points';
import { quizAttempts } from '../schema/quiz';
import { eq, and, sql } from 'drizzle-orm';

export function calculateQuizPoints(params: {
  score: number;
  integrityScore: number;
}): number {
  return params.integrityScore >= 70 ? params.score : 0;
}

export async function getBestPreviousPoints(
  userId: string,
  quizId: string,
  excludeAttemptId?: string
): Promise<number> {
  const conditions = [
    eq(quizAttempts.userId, userId),
    eq(quizAttempts.quizId, quizId),
  ];

  if (excludeAttemptId) {
    conditions.push(sql`${quizAttempts.id} != ${excludeAttemptId}`);
  }

  const result = await db
    .select({
      maxPoints: sql<number>`COALESCE(MAX(${quizAttempts.pointsEarned}), 0)`,
    })
    .from(quizAttempts)
    .where(and(...conditions));

  return result[0]?.maxPoints ?? 0;
}

export async function awardQuizPoints(params: {
  userId: string;
  quizId: string;
  attemptId: string;
  score: number;
  integrityScore: number;
}): Promise<number> {
  const { userId, quizId, attemptId, score, integrityScore } = params;

  const currentPoints = calculateQuizPoints({ score, integrityScore });
  const previousBest = await getBestPreviousPoints(userId, quizId, attemptId);
  const pointsToAward = Math.max(0, currentPoints - previousBest);

  if (pointsToAward === 0) {
    return 0;
  }

  await db
  .insert(pointTransactions)
  .values({
    userId,
    points: pointsToAward,
    source: 'quiz',
    sourceId: attemptId,
    metadata: {
      quizId,
      score,
      integrityScore,
      previousBest,
      currentPoints,
    },
  });

  revalidateTag('leaderboard', 'default');

  return pointsToAward;
}