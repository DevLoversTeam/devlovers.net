import { Metadata } from 'next';

import LeaderboardClient from '@/components/leaderboard/LeaderboardClient';
import { getLeaderboardData } from '@/db/queries/leaderboard';
import { ACHIEVEMENTS } from '@/lib/achievements';
import { getSponsors } from '@/lib/about/github-sponsors';
import { getCurrentUser } from '@/lib/auth';
import { getAllStargazers } from '@/lib/github-stars';

export const metadata: Metadata = {
  title: 'Leaderboard | DevLovers',
  description: 'Top performers of the community',
};

export const dynamic = 'force-dynamic';

// Map GitHub sponsor tier color → achievement id
const TIER_ACHIEVEMENT: Record<'gold' | 'silver' | 'bronze', string> = {
  gold: 'golden_patron',
  silver: 'silver_patron',
  bronze: 'supporter',
};

export default async function LeaderboardPage() {
  const [rows, session, sponsors, stargazerList] = await Promise.all([
    getLeaderboardData(),
    getCurrentUser(),
    getSponsors(),
    getAllStargazers(),
  ]);

  // Build O(1) lookup sets for stargazer matching
  const stargazerLogins = new Set(stargazerList.map(s => s.login));
  const stargazerAvatars = new Set(stargazerList.map(s => s.avatarBase));

  const users = rows.map(({ email, ...user }) => {
    const emailLower = email.toLowerCase();
    const nameLower = user.username.toLowerCase();

    const matchedSponsor = sponsors.find(
      s =>
        (s.email && s.email.toLowerCase() === emailLower) ||
        (nameLower && s.login.toLowerCase() === nameLower) ||
        (nameLower && s.name.toLowerCase() === nameLower) ||
        (user.avatar && s.avatarUrl && user.avatar.includes(s.avatarUrl.split('?')[0]))
    );

    const isSponsor = !!matchedSponsor;
    let achievements = user.achievements ?? [];

    // ── Inject sponsor achievement based on GitHub tier color ──────────
    if (matchedSponsor) {
      const achievementId = TIER_ACHIEVEMENT[matchedSponsor.tierColor];
      const def = ACHIEVEMENTS.find(a => a.id === achievementId);
      if (def && !achievements.some(a => a.id === achievementId)) {
        achievements = [
          { id: def.id, icon: def.icon, gradient: def.gradient, glow: def.glow },
          ...achievements,
        ];
      }
    }

    // ── Inject star_gazer if user has starred the repo ─────────────────
    // Match by GitHub login (username) or by avatar URL base
    const avatarBase = user.avatar?.split('?')[0] ?? '';
    const hasStarred =
      stargazerLogins.has(nameLower) ||
      (avatarBase.includes('avatars.githubusercontent.com') &&
        stargazerAvatars.has(avatarBase));

    if (hasStarred && !achievements.some(a => a.id === 'star_gazer')) {
      const def = ACHIEVEMENTS.find(a => a.id === 'star_gazer');
      if (def) {
        achievements = [
          { id: def.id, icon: def.icon, gradient: def.gradient, glow: def.glow },
          ...achievements,
        ];
      }
    }

    return { ...user, isSponsor, achievements };
  });

  return <LeaderboardClient initialUsers={users} currentUser={session} />;
}
