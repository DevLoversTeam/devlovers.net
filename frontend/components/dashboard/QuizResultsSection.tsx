'use client';

import { Shield, Star, Trophy } from 'lucide-react';
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
    'relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl p-4 sm:p-6 md:p-8 transition-all hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30';

  const primaryBtnStyles =
    'group relative inline-flex items-center justify-center rounded-full px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white bg-(--accent-primary) hover:bg-(--accent-hover) transition-all hover:scale-105';

  if (attempts.length === 0) {
    return (
      <section className={cardStyles}>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-6 rounded-full bg-gray-100 p-4 dark:bg-neutral-800/50">
            <Trophy className="h-8 w-8 text-gray-400" />
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
          className="rounded-full bg-gray-100 p-3 dark:bg-neutral-800/50"
          aria-hidden="true"
        >
          <Trophy className="h-5 w-5 text-(--accent-primary)" />
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

            {/* Column headers — desktop only, same grid as QuizResultRow */}
      <div className="mb-2 hidden items-center gap-2 px-4 md:grid md:grid-cols-[minmax(0,3fr)_1fr_1.5fr_1fr_1fr_2fr_20px] lg:grid-cols-[minmax(0,3fr)_1fr_1.5fr_1fr_1fr_1.5fr_2fr_20px]">
        <div className={headerCellStyles}>
          Quiz
        </div>
        <div className={`justify-center ${headerCellStyles}`} title={t('scoreHint')}>
          {t('score')}
        </div>
        <div className={`justify-center ${headerCellStyles}`}>
          %
        </div>
        <div className={`justify-center ${headerCellStyles}`} title={t('integrityHint')}>
          <Shield className="h-3 w-3" />
        </div>
        <div className={`justify-center ${headerCellStyles}`} title={t('pointsHint')}>
          <Star className="h-3 w-3" />
          {t('points')}
        </div>
        <div className={`hidden justify-end lg:flex ${headerCellStyles}`}>
          {t('date')}
        </div>
        <div className={`justify-end ${headerCellStyles}`}>
          {t('status')}
        </div>
        <div />
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {attempts.map((attempt) => (
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
