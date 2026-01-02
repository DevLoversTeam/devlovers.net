import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { db } from '../index';
import { users } from '../schema/users';
import { desc } from 'drizzle-orm';
import { User } from '@/components/leaderboard/types';

const getLeaderboardDataCached = unstable_cache(
  async (): Promise<User[]> => {
    const dbUsers = await db
      .select({
        id: users.id,
        username: users.name,
        points: users.points,
        avatar: users.image,
      })
      .from(users)
      .orderBy(desc(users.points))
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
        points: u.points || 0,
        avatar,
        change: 0,
      };
    });
  },
  ['leaderboard'],
  { revalidate: 300 }
);

export const getLeaderboardData = cache(async (): Promise<User[]> => {
  return getLeaderboardDataCached();
});
