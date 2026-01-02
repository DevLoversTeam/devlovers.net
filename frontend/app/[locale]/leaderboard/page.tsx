import { getLeaderboardData } from '@/db/queries/leaderboard';
import LeaderboardClient from '@/components/leaderboard/LeaderboardClient';

export const revalidate = 300;

export default async function LeaderboardPage() {
  const users = await getLeaderboardData();

  return <LeaderboardClient initialUsers={users} />;
}
