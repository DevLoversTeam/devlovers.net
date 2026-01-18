import { redirect } from '@/i18n/routing';
import { Link } from '@/i18n/routing'
import { getCurrentUser } from '@/lib/auth';
import { getUserProfile } from '@/db/queries/users';
import { getUserQuizStats } from '@/db/queries/quiz';

import { ProfileCard } from '@/components/dashboard/ProfileCard';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { QuizSavedBanner } from '@/components/dashboard/QuizSavedBanner';
import { PostAuthQuizSync } from "@/components/auth/PostAuthQuizSync";

export const metadata = {
  title: 'Dashboard | DevLovers',
  description: 'Track your progress and quiz performance.',
};

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const session = await getCurrentUser();
  const { locale } = await params;
  if (!session) { redirect({ href: '/login', locale }); return; }

  const user = await getUserProfile(session.id);
  if (!user) { redirect({ href: '/login', locale }); return; }

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
      ? new Date(attempts[0].completedAt).toLocaleDateString('uk-UA')
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
        className="absolute inset-0 pointer-events-none -z-10"
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black" />
        <div className="absolute top-0 left-1/4 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute bottom-0 right-0 h-[26rem] w-[26rem] rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-500/10" />
        <div className="absolute bottom-10 left-10 h-[20rem] w-[20rem] rounded-full bg-pink-300/20 blur-3xl dark:bg-fuchsia-500/10" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto py-12 px-6">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight drop-shadow-sm">
              <span className="bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400 dark:from-sky-400 dark:via-indigo-400 dark:to-fuchsia-500 bg-clip-text text-transparent">
                Dashboard
              </span>
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400 text-lg">
              Welcome back to your training ground.
            </p>
          </div>

          <Link href="/contacts" className={outlineBtnStyles}>
            Support & Feedback
          </Link>
        </header>
        <QuizSavedBanner />
        <div className="grid gap-8 md:grid-cols-2">
          <ProfileCard user={userForDisplay} />
          <StatsCard stats={stats} />
        </div>
      </div>
    </main>
  );
}
