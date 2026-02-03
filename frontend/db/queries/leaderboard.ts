import { desc, eq, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { User } from '@/components/leaderboard/types';

import { db } from '../index';
import { pointTransactions } from '../schema/points';
import { users } from '../schema/users';

const getLeaderboardDataCached = unstable_cache(
  async (): Promise<User[]> => {
    const dbUsers = await db
      .select({
        id: users.id,
        username: users.name,
        avatar: users.image,
        points: sql<number>`COALESCE(SUM(${pointTransactions.points}), 0)`,
      })
      .from(users)
      .leftJoin(pointTransactions, eq(pointTransactions.userId, users.id))
      .groupBy(users.id, users.name, users.image)
      .orderBy(desc(sql`COALESCE(SUM(${pointTransactions.points}), 0)`))
      .limit(50);

    return dbUsers.map((u, index) => {
      const username = u.username || 'Anonymous';
      const avatar =
        u.avatar && u.avatar !== 'null'
          ? u.avatar
          : `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(
              `${username}-${u.id}`
            )}`;

      return {
        id: index + 1,
        rank: index + 1,
        username,
        points: Number(u.points) || 0,
        avatar,
        change: 0,
      };
    });
  },
  ['leaderboard'],
  { revalidate: 3600, tags: ['leaderboard'] }
);

export const getLeaderboardData = cache(async (): Promise<User[]> => {
  return getLeaderboardDataCached();
});
