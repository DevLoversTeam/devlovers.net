import { getTranslations } from 'next-intl/server';
import { Heart, MessageSquare } from 'lucide-react';

import { PostAuthQuizSync } from '@/components/auth/PostAuthQuizSync';
import { AchievementsSection } from '@/components/dashboard/AchievementsSection';
import { ActivityHeatmapCard } from '@/components/dashboard/ActivityHeatmapCard';
import { ExplainedTermsCard } from '@/components/dashboard/ExplainedTermsCard';
import { FeedbackForm } from '@/components/dashboard/FeedbackForm';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { QuizResultsSection } from '@/components/dashboard/QuizResultsSection';
import { QuizSavedBanner } from '@/components/dashboard/QuizSavedBanner';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { getUserLastAttemptPerQuiz, getUserQuizStats } from '@/db/queries/quizzes/quiz';
import { getUserProfile, getUserGlobalRank } from '@/db/queries/users';
import { redirect } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';
import { computeAchievements } from '@/lib/achievements';
import { getUserStatsForAchievements } from '@/lib/user-stats';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const session = await getCurrentUser();
  const { locale } = await params;
  if (!session) {
    redirect({ href: '/login', locale });
    return;
  }

  const user = await getUserProfile(session.id);
  if (!user) {
    redirect({ href: '/login', locale });
    return;
  }

  const t = await getTranslations('dashboard');

  const attempts = await getUserQuizStats(session.id);
  const lastAttempts = await getUserLastAttemptPerQuiz(session.id, locale);

  const totalAttempts = attempts.length;

  const averageScore =
    lastAttempts.length > 0
      ? Math.round(
          lastAttempts.reduce((acc, curr) => acc + Number(curr.percentage), 0) /
            lastAttempts.length
        )
      : 0;

  const lastActiveDate =
    totalAttempts > 0
      ? new Date(attempts[0].completedAt).toLocaleDateString(locale)
      : null;

  const globalRank = await getUserGlobalRank(session.id);

  // 1. Calculate Daily Streak (using calendar-day strings to avoid DST issues)
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const uniqueAttemptDays = Array.from(
    new Set(attempts.map(a => toDateStr(new Date(a.completedAt))))
  );

  const getPrevDay = (d: Date): Date => {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return prev;
  };

  const now = new Date();
  const todayStr = toDateStr(now);
  const yesterdayStr = toDateStr(getPrevDay(now));

  let currentStreak = 0;
  if (uniqueAttemptDays.includes(todayStr) || uniqueAttemptDays.includes(yesterdayStr)) {
    let checkDate = uniqueAttemptDays.includes(todayStr) ? now : getPrevDay(now);
    currentStreak = 1;
    while (true) {
      checkDate = getPrevDay(checkDate);
      if (uniqueAttemptDays.includes(toDateStr(checkDate))) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // 2. Calculate Trend Percentage (Last 3 vs Previous 3)
  let trendPercentage: number | null = null;
  if (attempts.length >= 6) {
    const last3 = attempts.slice(0, 3);
    const prev3 = attempts.slice(3, 6);
    
    const last3Avg = last3.reduce((acc, curr) => acc + Number(curr.percentage), 0) / 3;
    const prev3Avg = prev3.reduce((acc, curr) => acc + Number(curr.percentage), 0) / 3;
    
    trendPercentage = Math.round(last3Avg - prev3Avg);
  } else if (attempts.length > 2) {
     const lastPart = attempts.slice(0, Math.floor(attempts.length / 2));
     const prevPart = attempts.slice(Math.floor(attempts.length / 2), Math.floor(attempts.length / 2) * 2);
     const lastAvg = lastPart.reduce((acc, curr) => acc + Number(curr.percentage), 0) / lastPart.length;
     const prevAvg = prevPart.reduce((acc, curr) => acc + Number(curr.percentage), 0) / prevPart.length;
     trendPercentage = Math.round(lastAvg - prevAvg);
  }

  const userForDisplay = {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? '',
    image: user.image ?? null,
    role: user.role ?? null,
    points: user.points,
    createdAt: user.createdAt ?? null,
  };

  const stats = {
    totalAttempts,
    averageScore,
    lastActiveDate,
    totalScore: user.points,
    trendPercentage,
  };

  const userStats = await getUserStatsForAchievements(session.id);
  const achievements = userStats ? computeAchievements(userStats) : [];

  const isMatchedSponsor = userStats ? userStats.sponsorCount > 0 : false;

  const outlineBtnStyles =
    'inline-flex items-center justify-center rounded-full border border-gray-200/50 bg-white/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-gray-700 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/20 hover:shadow-md hover:border-gray-300 dark:border-white/10 dark:bg-neutral-900/40 dark:text-gray-200 dark:hover:bg-neutral-800/80 dark:hover:border-white/20';

  const sponsorBtnStyles = 
    'group relative inline-flex items-center justify-center gap-2 rounded-full border border-(--accent-primary)/30 bg-(--accent-primary)/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-(--accent-primary) backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-(--accent-primary)/20 hover:shadow-[0_4px_12px_rgba(var(--accent-primary-rgb),0.2)] hover:border-(--accent-primary)/50 dark:border-(--accent-primary)/20 dark:bg-(--accent-primary)/5 dark:hover:bg-(--accent-primary)/20 dark:hover:border-(--accent-primary)/40 dark:hover:shadow-[0_4px_15px_rgba(var(--accent-primary-rgb),0.3)] overflow-hidden';

  return (
    <div className="min-h-screen">
      <PostAuthQuizSync />
      <DynamicGridBackground
        className="min-h-screen bg-gray-50 py-10 transition-colors duration-300 dark:bg-transparent"
      >
        <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <header className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h1 className="text-4xl font-black tracking-tight md:text-5xl">
                <span className="text-(--accent-primary)">{t('title')}</span>
              </h1>
              <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
                {t('subtitle')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#feedback"
                className={`group flex items-center gap-2 ${outlineBtnStyles}`}
              >
                <MessageSquare className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white" />
                {t('supportLink')}
              </a>
              <a
                href="https://github.com/sponsors/DevLoversTeam"
                target="_blank"
                rel="noopener noreferrer"
                className={sponsorBtnStyles}
              >
                {/* Subtle gradient glow background effect */}
                <div className="absolute inset-0 z-0 bg-linear-to-r from-transparent via-(--accent-primary)/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                
                <span className="relative z-10 flex items-center gap-2">
                  <Heart className="h-4 w-4 transition-transform group-hover:scale-110 group-hover:fill-(--accent-primary)/20" />
                  {isMatchedSponsor ? t('profile.supportAgain') : t('profile.becomeSponsor')}
                </span>
              </a>
            </div>
          </header>
          <QuizSavedBanner />
          <div className="flex flex-col gap-8">
            <ProfileCard
              user={userForDisplay}
              locale={locale}
              isSponsor={isMatchedSponsor}
              totalAttempts={totalAttempts}
              globalRank={globalRank}
            />
            <div className="grid gap-8 lg:grid-cols-2">
              <StatsCard stats={stats} attempts={lastAttempts} />
              <ActivityHeatmapCard attempts={attempts} locale={locale} currentStreak={currentStreak} />
            </div>
          </div>
          <div className="mt-8">
            <AchievementsSection achievements={achievements} />
          </div>
          <div className="mt-8">
            <QuizResultsSection attempts={lastAttempts} locale={locale} />
          </div>
          <div className="mt-8">
            <ExplainedTermsCard />
          </div>
          <div id="feedback" className="mt-8 scroll-mt-24">
            <FeedbackForm
              userName={userForDisplay.name}
              userEmail={userForDisplay.email}
            />
          </div>
        </main>
      </DynamicGridBackground>
    </div>
  );
}
