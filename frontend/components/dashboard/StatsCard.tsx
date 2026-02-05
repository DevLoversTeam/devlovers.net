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
    relative overflow-hidden rounded-2xl
    border border-gray-100 dark:border-white/5
    bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl
    p-8 transition-all hover:border-[var(--accent-primary)]/30 dark:hover:border-[var(--accent-primary)]/30
    flex flex-col items-center justify-center text-center
  `;

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center rounded-full
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white
    bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]
    transition-all hover:scale-105
  `;

  return (
    <section className={cardStyles} aria-labelledby="stats-heading">
      <div
        className="mb-6 rounded-full bg-gray-100 p-4 dark:bg-neutral-800/50"
        aria-hidden="true"
      >
        <span className="text-4xl">📊</span>
      </div>

      <h3
        id="stats-heading"
        className="mb-2 text-xl font-bold text-gray-900 dark:text-white"
      >
        {t('title')}
      </h3>

      {!hasActivity ? (
        <>
          <p className="mx-auto mb-8 max-w-xs text-gray-500 dark:text-gray-400">
            {t('noActivity')}
          </p>
          <Link href="/quizzes" className={primaryBtnStyles}>
            <span className="relative z-10">{t('startQuiz')}</span>
          </Link>
        </>
      ) : (
        <dl className="mt-2 grid w-full grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-white/5 dark:bg-neutral-800/50">
            <dt className="mb-1 flex items-center justify-center gap-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
              <History className="h-3 w-3" /> {t('attempts')}
            </dt>
            <dd className="text-2xl font-black text-gray-900 dark:text-white">
              {stats?.totalAttempts}
            </dd>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 dark:border-white/5 dark:bg-neutral-800/50">
            <dt className="mb-1 flex items-center justify-center gap-2 text-xs font-semibold tracking-wider text-gray-400 uppercase">
              <TrendingUp className="h-3 w-3" /> {t('avgScore')}
            </dt>
            <dd className="text-2xl font-black text-gray-900 dark:text-white">
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
