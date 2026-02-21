import { desc, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

import { User } from '@/components/leaderboard/types';
import { computeAchievements } from '@/lib/achievements';

import { db } from '../index';
import { users } from '../schema/users';

export interface LeaderboardRow extends User {
  email: string;
}

const getLeaderboardDataCached = unstable_cache(
  async (): Promise<LeaderboardRow[]> => {
    const dbUsers = await db
      .select({
        id: users.id,
        username: users.name,
        email: users.email,
        avatar: users.image,
        points: sql<number>`COALESCE(pt_valid.total, 0)`,
        totalAttempts: sql<number>`COALESCE(qa_stats.total_attempts, 0)`,
        averageScore: sql<number>`COALESCE(qa_stats.avg_score, 0)`,
        perfectScores: sql<number>`COALESCE(qa_stats.perfect_scores, 0)`,
        highScores: sql<number>`COALESCE(qa_stats.high_scores, 0)`,
        uniqueQuizzes: sql<number>`COALESCE(qa_stats.unique_quizzes, 0)`,
        hasNightOwl: sql<boolean>`COALESCE(qa_stats.has_night_owl, false)`,
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
      .leftJoin(
        sql`(
          SELECT
            qa.user_id,
            COUNT(*)::int                                                          AS total_attempts,
            ROUND(AVG(qa.percentage))::int                                         AS avg_score,
            COUNT(CASE WHEN qa.percentage = 100 THEN 1 END)::int                  AS perfect_scores,
            COUNT(CASE WHEN qa.percentage >= 90  THEN 1 END)::int                  AS high_scores,
            COUNT(DISTINCT qa.quiz_id)::int                                        AS unique_quizzes,
            BOOL_OR(EXTRACT(HOUR FROM qa.completed_at) < 5)                       AS has_night_owl
          FROM quiz_attempts qa
          GROUP BY qa.user_id
        ) qa_stats`,
        sql`qa_stats.user_id = ${users.id}`
      )
      .orderBy(desc(sql`COALESCE(pt_valid.total, 0)`))
      .limit(1000);

    return dbUsers.map((u, index) => {
      const username = u.username || 'Anonymous';
      const avatar =
        u.avatar && u.avatar.trim() !== '' && u.avatar !== 'null'
          ? u.avatar
          : `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(
              `${username}-${u.id}`
            )}`;

      const earnedAchievements = computeAchievements({
        totalAttempts: Number(u.totalAttempts),
        averageScore:  Number(u.averageScore),
        perfectScores: Number(u.perfectScores),
        highScores:    Number(u.highScores),
        uniqueQuizzes: Number(u.uniqueQuizzes),
        totalPoints:   Number(u.points),
        topLeaderboard: index < 10,
        hasNightOwl:   Boolean(u.hasNightOwl),
        // sponsor/star data not available at query time — shown on dashboard only
        isSponsor:     false,
        hasStarredRepo: false,
        sponsorCount:  0,
      })
        .filter(a => a.earned)
        .map(({ id, icon, gradient, glow }) => ({ id, icon, gradient, glow }));

      return {
        id: index + 1,
        userId: u.id,
        rank: index + 1,
        username,
        points: Number(u.points) || 0,
        avatar,
        email: u.email,
        change: 0,
        achievements: earnedAchievements,
      };
    });
  },
  ['leaderboard'],
  { revalidate: 3600, tags: ['leaderboard'] }
);

export const getLeaderboardData = cache(async (): Promise<LeaderboardRow[]> => {
  return getLeaderboardDataCached();
});
