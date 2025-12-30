import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
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
      points: true,
      createdAt: true,
    },
    with: {
      quizAttempts: {
        limit: 10,
        orderBy: (quisAttemps, { desc }) => [desc(quisAttemps.completedAt)],
      },
    },
  });

  return user;
});
