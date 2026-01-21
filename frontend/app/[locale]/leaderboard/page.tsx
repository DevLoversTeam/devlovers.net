import { getLeaderboardData } from '@/db/queries/leaderboard';
import LeaderboardClient from '@/components/leaderboard/LeaderboardClient';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard | DevLovers',
  description: 'Top performers of the community',
};

export const revalidate = 3600;

export default async function LeaderboardPage() {
  const users = await getLeaderboardData();

  return <LeaderboardClient initialUsers={users} />;
}
