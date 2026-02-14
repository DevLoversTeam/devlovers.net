import { desc, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { User } from '@/components/leaderboard/types';

import { db } from '../index';
import { users } from '../schema/users';

const getLeaderboardDataCached = unstable_cache(
  async (): Promise<User[]> => {
    const dbUsers = await db
      .select({
        id: users.id,
        username: users.name,
        avatar: users.image,
        points: sql<number>`COALESCE(pt_valid.total, 0)`,
      })
      .from(users)
      .leftJoin(
        sql`(
          SELECT pt.user_id, SUM(pt.points)::int AS total
          FROM point_transactions pt
          WHERE pt.source = 'quiz'
            AND (pt.source_id IS NULL OR pt.source_id IN (SELECT id FROM quiz_attempts))
          GROUP BY pt.user_id
        ) pt_valid`,
        sql`pt_valid.user_id = ${users.id}`
      )
      .orderBy(desc(sql`COALESCE(pt_valid.total, 0)`))
      .limit(50);

    return dbUsers.map((u, index) => {
      const username = u.username || 'Anonymous';
      const avatar =
        u.avatar && u.avatar.trim() !== '' && u.avatar !== 'null'
          ? u.avatar
          : `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(
              `${username}-${u.id}`
            )}`;

      return {
        id: index + 1,
        userId: u.id,
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
