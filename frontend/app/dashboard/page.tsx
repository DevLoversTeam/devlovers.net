import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getUserProfile } from '@/db/queries/users';
import Link from 'next/link';

export const metadata = {
  title: 'Dashboard | DevLovers',
};

export default async function DashboardPage() {
  const session = await getCurrentUser();

  if (!session) {
    redirect('/login');
  }

  const user = await getUserProfile(session.id);

  if (!user) {
    redirect('/login');
  }

  // Стилі для кнопок (адаптовані під HeroSection)
  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center rounded-full 
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white 
    bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 
    shadow-[0_4px_14px_rgba(56,189,248,0.4)] 
    dark:shadow-[0_4px_20px_rgba(129,140,248,0.4)] 
    transition-all hover:scale-105 hover:shadow-lg
  `;

  const outlineBtnStyles = `
    inline-flex items-center justify-center rounded-full 
    border border-slate-200 dark:border-slate-700 
    bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm
    px-6 py-2 text-sm font-medium text-slate-600 dark:text-slate-300
    transition-colors hover:bg-white hover:text-sky-600 
    dark:hover:bg-slate-800 dark:hover:text-sky-400
  `;

  // Стилі для карток (Glassmorphism як у CodeCard)
  const cardStyles = `
    relative overflow-hidden rounded-[2rem]
    border border-slate-200/70 dark:border-slate-700/80
    bg-white/60 dark:bg-slate-900/60 backdrop-blur-md
    shadow-[0_18px_45px_rgba(15,23,42,0.05)]
    dark:shadow-[0_22px_60px_rgba(0,0,0,0.2)]
    p-8 transition-all hover:border-sky-200 dark:hover:border-sky-800
  `;

  return (
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden">
      {/* --- BACKGROUND EFFECTS (З HeroSection) --- */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        {/* Base Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black" />

        {/* Animated Blobs */}
        <div className="absolute top-0 left-1/4 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-500/10" />
        <div className="absolute bottom-0 right-0 h-[26rem] w-[26rem] rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-500/10" />
        <div className="absolute bottom-10 left-10 h-[20rem] w-[20rem] rounded-full bg-pink-300/20 blur-3xl dark:bg-fuchsia-500/10" />
      </div>

      {/* --- CONTENT --- */}
      <div className="relative z-10 max-w-5xl mx-auto py-12 px-6">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
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
        </div>

        {/* GRID */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* USER PROFILE CARD */}
          <div className={cardStyles}>
            <div className="flex items-start gap-6">
              {/* Avatar with gradient border */}
              <div className="relative p-[3px] rounded-full bg-gradient-to-br from-sky-400 to-pink-400">
                <div className="h-20 w-20 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-3xl font-bold text-slate-700 dark:text-slate-200">
                  {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                </div>
              </div>

              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                  {user.name || 'Developer'}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-mono">
                  {user.email}
                </p>

                <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                  {user.role}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800/50 grid grid-cols-2 gap-6">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Total Points
                </span>
                <div className="text-3xl font-black text-slate-800 dark:text-white mt-1">
                  {user.points}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Joined
                </span>
                <div className="text-lg font-medium text-slate-700 dark:text-slate-300 mt-2">
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('uk-UA')
                    : '-'}
                </div>
              </div>
            </div>
          </div>

          {/* STATS / ACTION CARD */}
          <div
            className={`${cardStyles} flex flex-col items-center justify-center text-center`}
          >
            <div className="mb-6 p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 shadow-inner">
              <span className="text-4xl">📊</span>
            </div>

            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
              Quiz Statistics
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto">
              Ready to level up? Challenge yourself with a new React quiz.
            </p>

            <Link href="/quiz/react-fundamentals" className={primaryBtnStyles}>
              <span className="relative z-10">Start a Quiz</span>
              {/* Shine effect */}
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
