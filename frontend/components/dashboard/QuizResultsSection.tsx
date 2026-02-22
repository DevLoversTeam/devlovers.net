'use client';

import { Shield, Star, ClipboardList } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { QuizResultRow } from '@/components/dashboard/QuizResultRow';
import { Link } from '@/i18n/routing';
import type { UserLastAttempt } from '@/types/quiz';

interface QuizResultsSectionProps {
  attempts: UserLastAttempt[];
  locale: string;
}

export function QuizResultsSection({ attempts, locale }: QuizResultsSectionProps) {
  const t = useTranslations('dashboard.quizResults');

  const cardStyles =
    'relative z-10 flex flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/10 p-6 sm:p-8 lg:p-10 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/10';

  const iconBoxStyles = 'shrink-0 rounded-xl bg-white/40 border border-white/20 shadow-xs backdrop-blur-xs p-3 dark:bg-white/5 dark:border-white/10';

  const primaryBtnStyles =
    'group relative inline-flex items-center justify-center rounded-full px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white bg-(--accent-primary) hover:bg-(--accent-hover) transition-all hover:scale-105';

  if (attempts.length === 0) {
    return (
      <section className={cardStyles}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-6 rounded-full bg-gray-100 p-4 dark:bg-neutral-800/50">
            <ClipboardList className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
          <p className="mx-auto mb-8 max-w-xs text-gray-500 dark:text-gray-400">
            {t('noAttempts')}
          </p>
          <Link href="/quizzes" className={primaryBtnStyles}>
            <span className="relative z-10">{t('startQuiz')}</span>
          </Link>
        </div>
      </section>
    );
  }

  const headerCellStyles = 'flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-gray-400';

  return (
    <section className={cardStyles}>
      <div className="mb-6 flex items-center gap-3">
        <div
          className={iconBoxStyles}
          aria-hidden="true"
        >
          <ClipboardList className="h-5 w-5 text-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.6)]" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
            {t('title')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subtitle')}
          </p>
        </div>
      </div>

      <div className="mb-2 hidden items-center gap-2 px-4 md:grid md:grid-cols-[minmax(0,4fr)_1fr_1.5fr_1fr_1fr_1fr_20px] lg:grid-cols-[minmax(0,4fr)_1fr_1.5fr_1fr_1fr_1fr_1.2fr_20px]">
        <div className={headerCellStyles}>
          Quiz
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          {t('score')}
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          {t('accuracy', { fallback: 'Accuracy' })}
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          {t('integrity')}
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          {t('points')}
        </div>
        <div className={`hidden justify-center lg:flex ${headerCellStyles}`}>
          {t('date')}
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          {t('status')}
        </div>
        <div />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {[...attempts]
          .sort((a, b) => {
            const scoreA = Number(a.percentage);
            const scoreB = Number(b.percentage);
            
            // Bucket values: Study = 1, Review = 2, Mastered = 3
            // So that Study (1) comes before Review (2) before Mastered (3)
            const bucketA = scoreA < 70 ? 1 : scoreA < 100 ? 2 : 3;
            const bucketB = scoreB < 70 ? 1 : scoreB < 100 ? 2 : 3;
            
            if (bucketA !== bucketB) {
              return bucketA - bucketB; // Ascending order of buckets
            }
            
            // If they are in the same bucket, sort by most recent first
            return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
          })
          .map((attempt) => (
            <QuizResultRow
              key={attempt.attemptId}
              attempt={attempt}
              locale={locale}
            />
          ))}
      </div>
    </section>
  );
}
