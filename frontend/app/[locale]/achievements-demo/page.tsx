import { AchievementsSection } from '@/components/dashboard/AchievementsSection';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { computeAchievements } from '@/lib/achievements';

export default function AchievementsDemoPage() {
  // Mix of earned and unearned for a realistic preview
  const achievements = computeAchievements({
    totalAttempts: 4,
    averageScore: 78,
    perfectScores: 1,
    highScores: 2,
    isSponsor: false,
    uniqueQuizzes: 4,
    totalPoints: 80,
    topLeaderboard: false,
    hasStarredRepo: true,  // demo: show star_gazer as earned
    sponsorCount: 0,
    hasNightOwl: false,
  });

  return (
    <DynamicGridBackground className="min-h-screen bg-gray-50 py-16 dark:bg-transparent">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white">
            🏅 Achievements Preview
          </h1>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Flip the badges to see details. Locked badges show your progress.
          </p>
        </div>
        <AchievementsSection achievements={achievements} />
      </main>
    </DynamicGridBackground>
  );
}
