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
