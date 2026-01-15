import { Link } from '@/i18n/routing';
import { TrendingUp, History } from 'lucide-react';

interface StatsCardProps {
  stats?: {
    totalAttempts: number;
    averageScore: number;
    lastActiveDate: string | null;
  };
}

export function StatsCard({ stats }: StatsCardProps) {
  const hasActivity = stats && stats.totalAttempts > 0;

  const cardStyles = `
    relative overflow-hidden rounded-[2rem]
    border border-slate-200/70 dark:border-slate-700/80
    bg-white/60 dark:bg-slate-900/60 backdrop-blur-md
    shadow-[0_18px_45px_rgba(15,23,42,0.05)]
    dark:shadow-[0_22px_60px_rgba(0,0,0,0.2)]
    p-8 transition-all hover:border-sky-200 dark:hover:border-sky-800
    flex flex-col items-center justify-center text-center
  `;

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center rounded-full 
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white 
    bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 
    shadow-[0_4px_14px_rgba(56,189,248,0.4)] 
    dark:shadow-[0_4px_20px_rgba(129,140,248,0.4)] 
    transition-all hover:scale-105 hover:shadow-lg
  `;

  return (
    <section className={cardStyles} aria-labelledby="stats-heading">
      <div
        className="mb-6 p-4 rounded-full bg-slate-50 dark:bg-slate-800/50 shadow-inner"
        aria-hidden="true"
      >
        <span className="text-4xl">📊</span>
      </div>

      <h3
        id="stats-heading"
        className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2"
      >
        Quiz Statistics
      </h3>

      {!hasActivity ? (
        <>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-xs mx-auto">
            Ready to level up? Challenge yourself with a new React quiz.
          </p>
          <Link href="/quizzes" className={primaryBtnStyles}>
            <span className="relative z-10">Start a Quiz</span>
            <span
              className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
              aria-hidden="true"
            />
          </Link>
        </>
      ) : (
        <dl className="w-full grid grid-cols-2 gap-4 mt-2">
          <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
            <dt className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <History className="w-3 h-3" /> Attempts
            </dt>
            <dd className="text-2xl font-black text-slate-800 dark:text-white">
              {stats?.totalAttempts}
            </dd>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
            <dt className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              <TrendingUp className="w-3 h-3" /> Avg Score
            </dt>
            <dd className="text-2xl font-black text-slate-800 dark:text-white">
              {stats?.averageScore}%
            </dd>
          </div>

          <div className="col-span-2 mt-4">
            <Link href="/q&a" className={primaryBtnStyles}>
              <span className="relative z-10">Continue Learning</span>
            </Link>
          </div>
        </dl>
      )}
    </section>
  );
}
