import { getLeaderboardData } from '@/db/queries/leaderboard';
import LeaderboardClient from '@/components/leaderboard/LeaderboardClient';
import { getCurrentUser } from '@/lib/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Leaderboard | DevLovers',
  description: 'Top performers of the community',
};

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const users = await getLeaderboardData();
  const session = await getCurrentUser();

  return <LeaderboardClient initialUsers={users} currentUser={session} />;
}
