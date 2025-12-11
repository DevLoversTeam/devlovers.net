import { db } from '../index';
import { users } from '../schema/users';
import { pointTransactions } from '../schema/points';
import { quizAttempts } from '../schema/quiz';
import { eq, and, desc, sql } from 'drizzle-orm';

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

  const attempts = await db
    .select({
      score: quizAttempts.score,
      integrityScore: quizAttempts.integrityScore,
    })
    .from(quizAttempts)
    .where(and(...conditions))
    .orderBy(desc(quizAttempts.completedAt));

  if (!attempts.length) return 0;

  const pointsArray = attempts.map(attempt =>
    calculateQuizPoints({
      score: attempt.score,
      integrityScore: attempt.integrityScore ?? 0,
    })
  );

  return Math.max(...pointsArray);
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

  try {
    await db.transaction(async tx => {
      await tx.insert(pointTransactions).values({
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

      await tx
        .update(users)
        .set({
          points: sql`${users.points} + ${pointsToAward}`,
        })
        .where(eq(users.id, userId));
    });
    return pointsToAward;
  } catch (error) {
    console.error('Failed to award points:', error);
    throw error;
  }
}