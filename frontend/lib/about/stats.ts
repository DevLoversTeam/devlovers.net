import { count } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { db } from '@/db';
import { quizAttempts } from '@/db/schema/quiz';
import { users } from '@/db/schema/users';

export interface PlatformStats {
  githubStars: string;
  linkedinFollowers: string;
  activeUsers: string;
  questionsSolved: string;
}

const formatMetric = (n: number) => {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k+';
  return n.toString();
};

export const getPlatformStats = unstable_cache(
  async (): Promise<PlatformStats> => {
    let stars = 125;
    try {
      const headers: HeadersInit = {};
      if (process.env.GITHUB_TOKEN)
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

      const res = await fetch(
        'https://api.github.com/repos/DevLoversTeam/devlovers.net',
        {
          headers,
          cache: 'no-store',
        }
      );

      if (res.ok) {
        const data = await res.json();
        stars = data.stargazers_count;
      }
    } catch (e) {
      console.error('GitHub Fetch Error:', e);
    }

    const linkedinCount = process.env.LINKEDIN_FOLLOWER_COUNT
      ? parseInt(process.env.LINKEDIN_FOLLOWER_COUNT)
      : 1400;

    let totalUsers = 243;
    let solvedTests = 1890;
    try {
      const [[u], [q]] = await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(quizAttempts),
      ]);

      if (u) totalUsers = u.value;
      if (q) solvedTests = q.value;
    } catch (e) {
      console.error('DB Fetch Error:', e);
    }

    return {
      githubStars: formatMetric(stars),
      linkedinFollowers: formatMetric(linkedinCount),
      activeUsers: formatMetric(totalUsers),
      questionsSolved: formatMetric(solvedTests),
    };
  },
  ['platform-stats'],
  { revalidate: 3600 }
);
