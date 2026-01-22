'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing'

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
       console.error('Failed to parse quiz_just_saved from sessionStorage:', error);
      sessionStorage.removeItem('quiz_just_saved');
    }
    }
  }, []);

  if (!info) return null;

  return (
    <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <div className="text-center space-y-2">
        <p className="text-green-800 dark:text-green-200 font-medium text-lg">
          🎉 {t('title')}
        </p>
        <p className="text-green-700 dark:text-green-300">
          {t('scored')} <strong>{info.score}/{info.total}</strong> ({info.percentage.toFixed(0)}%)
          {info.pointsAwarded > 0 && (
            <> • <strong>{t('pointsAwarded', { points: info.pointsAwarded })}</strong></>
          )}
          {info.pointsAwarded === 0 && (
            <> • {t('noPoints')}</>
          )}
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            href="/leaderboard"
            className="text-green-600 dark:text-green-400 underline hover:no-underline"
          >
            {t('viewLeaderboard')}
          </Link>
          <Link
            href={`/quiz/${info.quizSlug}`}
            className="text-green-600 dark:text-green-400 underline hover:no-underline"
          >
            {t('tryAgain')}
          </Link>
        </div>
      </div>
    </div>
  );
}
