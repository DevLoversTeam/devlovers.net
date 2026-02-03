'use client';

import { History, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';

interface StatsCardProps {
  stats?: {
    totalAttempts: number;
    averageScore: number;
    lastActiveDate: string | null;
  };
}

export function StatsCard({ stats }: StatsCardProps) {
  const t = useTranslations('dashboard.stats');
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
        className="mb-6 rounded-full bg-slate-50 p-4 shadow-inner dark:bg-slate-800/50"
        aria-hidden="true"
      >
        <span className="text-4xl">📊</span>
      </div>

      <h3
        id="stats-heading"
        className="mb-2 text-xl font-bold text-slate-800 dark:text-slate-100"
      >
        {t('title')}
      </h3>

      {!hasActivity ? (
        <>
          <p className="mx-auto mb-8 max-w-xs text-slate-500 dark:text-slate-400">
            {t('noActivity')}
          </p>
          <Link href="/quizzes" className={primaryBtnStyles}>
            <span className="relative z-10">{t('startQuiz')}</span>
            <span
              className="absolute inset-0 rounded-full bg-gradient-to-r from-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </Link>
        </>
      ) : (
        <dl className="mt-2 grid w-full grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <dt className="mb-1 flex items-center justify-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              <History className="h-3 w-3" /> {t('attempts')}
            </dt>
            <dd className="text-2xl font-black text-slate-800 dark:text-white">
              {stats?.totalAttempts}
            </dd>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <dt className="mb-1 flex items-center justify-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              <TrendingUp className="h-3 w-3" /> {t('avgScore')}
            </dt>
            <dd className="text-2xl font-black text-slate-800 dark:text-white">
              {stats?.averageScore}%
            </dd>
          </div>

          <div className="col-span-2 mt-4">
            <Link href="/q&a" className={primaryBtnStyles}>
              <span className="relative z-10">{t('continueLearning')}</span>
            </Link>
          </div>
        </dl>
      )}
    </section>
  );
}
