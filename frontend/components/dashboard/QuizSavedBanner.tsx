'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Link } from '@/i18n/routing';

interface SavedQuizInfo {
  score: number;
  total: number;
  percentage: number;
  pointsAwarded: number;
  quizSlug: string;
}

export function QuizSavedBanner() {
  const t = useTranslations('dashboard.quizSaved');
  const [info, setInfo] = useState<SavedQuizInfo | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('quiz_just_saved');
    if (saved) {
      try {
        setInfo(JSON.parse(saved));
        sessionStorage.removeItem('quiz_just_saved');
      } catch (error) {
        console.error(
          'Failed to parse quiz_just_saved from sessionStorage:',
          error
        );
        sessionStorage.removeItem('quiz_just_saved');
      }
    }
  }, []);

  if (!info) return null;

  return (
    <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
      <div className="space-y-2 text-center">
        <p className="text-lg font-medium text-green-800 dark:text-green-200">
          🎉 {t('title')}
        </p>
        <p className="text-green-700 dark:text-green-300">
          {t('scored')}{' '}
          <strong>
            {info.score}/{info.total}
          </strong>{' '}
          ({info.percentage.toFixed(0)}%)
          {info.pointsAwarded > 0 && (
            <>
              {' '}
              •{' '}
              <strong>
                {t('pointsAwarded', { points: info.pointsAwarded })}
              </strong>
            </>
          )}
          {info.pointsAwarded === 0 && <> • {t('noPoints')}</>}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/leaderboard"
            className="text-green-600 underline hover:no-underline dark:text-green-400"
          >
            {t('viewLeaderboard')}
          </Link>
          <Link
            href={`/quiz/${info.quizSlug}`}
            className="text-green-600 underline hover:no-underline dark:text-green-400"
          >
            {t('tryAgain')}
          </Link>
        </div>
      </div>
    </div>
  );
}
