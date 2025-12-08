import { db } from '../index';
import { users } from '../schema/users';
import { desc } from 'drizzle-orm';
import { User } from '@/components/leaderboard/types';

export async function getLeaderboardData(): Promise<User[]> {
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

  return dbUsers.map((u, index) => ({
    id: index + 1,
    rank: index + 1,
    username: u.username || 'Anonymous',
    points: u.points || 0,
    avatar: u.avatar || '',
    change: 0,
  }));
}
