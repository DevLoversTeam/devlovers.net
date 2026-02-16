import { Metadata } from 'next';

import LeaderboardClient from '@/components/leaderboard/LeaderboardClient';
import { getLeaderboardData } from '@/db/queries/leaderboard';
import { getSponsors } from '@/lib/about/github-sponsors';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Leaderboard | DevLovers',
  description: 'Top performers of the community',
};

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const [rows, session, sponsors] = await Promise.all([
    getLeaderboardData(),
    getCurrentUser(),
    getSponsors(),
  ]);

  const users = rows.map(({ email, ...user }) => {
    const emailLower = email.toLowerCase();
    const nameLower = user.username.toLowerCase();
    const isSponsor = sponsors.some(
      s =>
        (s.email && s.email.toLowerCase() === emailLower) ||
        (nameLower && s.login.toLowerCase() === nameLower) ||
        (nameLower && s.name.toLowerCase() === nameLower) ||
        (user.avatar && s.avatarUrl && user.avatar.includes(s.avatarUrl.split('?')[0]))
    );
    return { ...user, isSponsor };
  });

  return <LeaderboardClient initialUsers={users} currentUser={session} />;
}
