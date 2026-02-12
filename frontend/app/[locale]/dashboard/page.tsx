import { getTranslations } from 'next-intl/server';

import { PostAuthQuizSync } from '@/components/auth/PostAuthQuizSync';
import { QuizResultsSection } from '@/components/dashboard/QuizResultsSection';
import { ExplainedTermsCard } from '@/components/dashboard/ExplainedTermsCard';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { QuizSavedBanner } from '@/components/dashboard/QuizSavedBanner';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { getUserLastAttemptPerQuiz, getUserQuizStats } from '@/db/queries/quiz';
import { getUserProfile } from '@/db/queries/users';
import { redirect } from '@/i18n/routing';
import { getCurrentUser } from '@/lib/auth';

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
  };

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

            <a
              href="https://t.me/devloversteam"
              target="_blank"
              rel="noopener noreferrer"
              className={outlineBtnStyles}
            >
              {t('supportLink')}
            </a>
          </header>
          <QuizSavedBanner />
          <div className="grid gap-8 md:grid-cols-2">
            <ProfileCard user={userForDisplay} locale={locale} />
            <StatsCard stats={stats} />
          </div>
                    <div className="mt-8">
            <ExplainedTermsCard />
          </div>
          <div className="mt-8">
            <QuizResultsSection attempts={lastAttempts} locale={locale} />
          </div>
        </main>
      </DynamicGridBackground>
    </div>
  );
}
