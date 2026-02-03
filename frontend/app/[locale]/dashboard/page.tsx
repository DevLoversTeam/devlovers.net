import { getTranslations } from 'next-intl/server';

import { PostAuthQuizSync } from '@/components/auth/PostAuthQuizSync';
import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { QuizSavedBanner } from '@/components/dashboard/QuizSavedBanner';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { getUserQuizStats } from '@/db/queries/quiz';
import { getUserProfile } from '@/db/queries/users';
import { redirect } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
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
    name: user.name ?? null,
    email: user.email ?? '',
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
    'inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm px-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors hover:bg-white hover:text-sky-600 dark:hover:bg-slate-800 dark:hover:text-sky-400';

  return (
    <main className="relative min-h-[calc(100vh-80px)] overflow-hidden">
      <PostAuthQuizSync />
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black" />
        <div className="absolute top-0 left-1/4 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute right-0 bottom-0 h-[26rem] w-[26rem] rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-500/10" />
        <div className="absolute bottom-10 left-10 h-[20rem] w-[20rem] rounded-full bg-pink-300/20 blur-3xl dark:bg-fuchsia-500/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <header className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="text-4xl font-black tracking-tight drop-shadow-sm md:text-5xl">
              <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400 bg-clip-text text-transparent dark:from-sky-400 dark:via-indigo-400 dark:to-fuchsia-500">
                {t('title')}
              </span>
            </h1>
            <p className="mt-2 text-lg text-slate-600 dark:text-slate-400">
              {t('subtitle')}
            </p>
          </div>

          <span className={outlineBtnStyles}>{t('supportLink')}</span>
        </header>
        <QuizSavedBanner />
        <div className="grid gap-8 md:grid-cols-2">
          <ProfileCard user={userForDisplay} locale={locale} />
          <StatsCard stats={stats} />
        </div>
      </div>
    </main>
  );
}
