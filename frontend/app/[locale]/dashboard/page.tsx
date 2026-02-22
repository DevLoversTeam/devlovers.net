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
import { getSponsors, getAllSponsors } from '@/lib/about/github-sponsors';
import { getCurrentUser } from '@/lib/auth';
import { computeAchievements } from '@/lib/achievements';
import { checkHasStarredRepo, resolveGitHubLogin } from '@/lib/github-stars';

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

  // Active sponsors — used for the sponsor badge / button display in the UI
  const sponsors = await getSponsors();
  // All-time sponsors (active + past) — used for the Supporter achievement check
  const allSponsors = await getAllSponsors();

  const userEmail = user.email.toLowerCase();
  const userName = (user.name ?? '').toLowerCase();
  const userImage = user.image ?? '';

  function findSponsor(list: typeof sponsors) {
    return list.find(s => {
      if (s.email && s.email.toLowerCase() === userEmail) return true;
      if (userName && s.login && s.login.toLowerCase() === userName) return true;
      if (userName && s.name && s.name.toLowerCase() === userName) return true;
      if (
        userImage &&
        s.avatarUrl &&
        s.avatarUrl.trim().length > 0 &&
        userImage.includes(s.avatarUrl.split('?')[0])
      ) return true;
      return false;
    });
  }

  const matchedSponsor    = findSponsor(sponsors);   // active — for UI display
  const everSponsor       = findSponsor(allSponsors); // all-time — for achievements

  // Determine the GitHub login to check against the stargazers list.
  // Priority:
  //   1. Matched sponsor login (most reliable — org PAT already resolved it)
  //   2. For GitHub-OAuth users: resolve login from numeric providerId
  //   3. user.name as last resort (may be a display name, not a login!)
  let githubLogin = matchedSponsor?.login || '';
  if (!githubLogin && user.provider === 'github' && user.providerId) {
    githubLogin = (await resolveGitHubLogin(user.providerId)) ?? user.name ?? '';
  } else if (!githubLogin) {
    githubLogin = user.name ?? '';
  }

  const hasStarredRepo = githubLogin
    ? await checkHasStarredRepo(githubLogin)
    : false;

  const attempts = await getUserQuizStats(session.id);
  const lastAttempts = await getUserLastAttemptPerQuiz(session.id, locale);

  const totalAttempts = attempts.length;

  const averageScore =
    totalAttempts > 0
      ? Math.round(
          attempts.reduce((acc, curr) => acc + Number(curr.percentage), 0) /
            totalAttempts
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

  const perfectScores = attempts.filter((a) => Number(a.percentage) === 100).length;
  const highScores = attempts.filter((a) => Number(a.percentage) >= 90).length;
  const uniqueQuizzes = lastAttempts.length;

  // Night Owl: any attempt completed between 00:00 and 05:00 local time
  const hasNightOwl = attempts.some((a) => {
    if (!a.completedAt) return false;
    const hour = new Date(a.completedAt).getHours();
    return hour >= 0 && hour < 5;
  });

  const achievements = computeAchievements({
    totalAttempts,
    averageScore,
    perfectScores,
    highScores,
    isSponsor: !!everSponsor,
    uniqueQuizzes,
    totalPoints: user.points,
    topLeaderboard: false,
    hasStarredRepo,
    sponsorCount: matchedSponsor ? 1 : 0, // TODO: wire to actual sponsorship history count
    hasNightOwl,
  });

  const outlineBtnStyles =
    'inline-flex items-center justify-center rounded-full border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm px-6 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 transition-colors hover:bg-white hover:text-(--accent-primary) dark:hover:bg-neutral-800 dark:hover:text-(--accent-primary)';

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
                <MessageSquare className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
                {t('supportLink')}
              </a>
              <a
                href="https://github.com/sponsors/DevLoversTeam"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-full border border-(--accent-primary) bg-(--accent-primary)/10 px-6 py-2 text-sm font-medium text-(--accent-primary) transition-colors hover:bg-(--accent-primary) hover:text-white dark:border-(--accent-primary)/50 dark:bg-(--accent-primary)/10 dark:text-(--accent-primary) dark:hover:bg-(--accent-primary) dark:hover:text-white"
              >
                <Heart className="h-4 w-4 transition-transform group-hover:scale-110" />
                {!!matchedSponsor ? t('profile.supportAgain') : t('profile.becomeSponsor')}
              </a>
            </div>
          </header>
          <QuizSavedBanner />
          <div className="flex flex-col gap-8">
            <ProfileCard
              user={userForDisplay}
              locale={locale}
              isSponsor={!!matchedSponsor}
              totalAttempts={totalAttempts}
              globalRank={globalRank}
            />
            <div className="grid gap-8 lg:grid-cols-2">
              <StatsCard stats={stats} attempts={attempts} />
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
