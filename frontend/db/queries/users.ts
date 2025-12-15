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
      // Тут пізніше додамо зв'язок з attempts (спробами квізів), коли буде готова схема quiz
      // attempts: {
      //   limit: 5,
      //   orderBy: (attempts, { desc }) => [desc(attempts.startedAt)],
      // },
    },
  });

  return user;
});
