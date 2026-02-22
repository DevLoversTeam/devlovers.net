import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { cache } from 'react';

import { db } from '@/db';
import { pointTransactions } from '@/db/schema/points';
import { users } from '@/db/schema/users';

export const getUserProfile = cache(async (userId: string) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      provider: true,
      providerId: true,
      createdAt: true,
    },
    with: {
      quizAttempts: {
        limit: 10,
        orderBy: (quizAttempts, { desc }) => [desc(quizAttempts.completedAt)],
      },
    },
  });

  if (!user) return null;

  const pointsResult = await db
    .select({
      total: sql<number>`COALESCE(SUM(${pointTransactions.points}), 0)`,
    })
    .from(pointTransactions)
    .where(eq(pointTransactions.userId, userId));

  return {
    ...user,
    points: Number(pointsResult[0]?.total) || 0,
  };
});

export const getUserGlobalRank = cache(async (userId: string) => {
  // Get all users' total points by grouping transactions
  const rankQuery = sql`
    WITH user_scores AS (
      SELECT user_id, COALESCE(SUM(points), 0) as total_points
      FROM point_transactions
      GROUP BY user_id
    ),
    ranked_users AS (
      SELECT user_id, total_points,
             RANK() OVER (ORDER BY total_points DESC) as rank
      FROM user_scores
    )
    SELECT rank
    FROM ranked_users
    WHERE user_id = ${userId}
  `;

  const result = await db.execute(rankQuery);
  const rankRow = (result as { rows: any[] }).rows[0];

  if (!rankRow || !rankRow.rank) {
    return null;
  }

  return Number(rankRow.rank);
});
