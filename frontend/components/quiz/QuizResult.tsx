'use client';

import {
  BookOpen,
  Clock,
  TrendingUp,
  TriangleAlert,
  Trophy,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QuizResultProps {
  score: number;
  total: number;
  percentage: number;
  answeredCount: number;
  violationsCount?: number;
  isGuest?: boolean;
  quizSlug?: string;
  pointsAwarded?: number | null;
  isIncomplete?: boolean;
  attemptId?: string;
  onRestart: () => void;
  onBackToTopics: () => void;
}

export function QuizResult({
  score,
  total,
  percentage,
  answeredCount,
  violationsCount = 0,
  pointsAwarded,
  isGuest = false,
  isIncomplete = false,
  attemptId,
  onRestart,
  onBackToTopics,
}: QuizResultProps) {
  const locale = useLocale();
  const t = useTranslations('quiz.result');
  const getMotivationalMessage = () => {
    if (isIncomplete && answeredCount > 0) {
      return {
        icon: <Clock className="h-14 w-14 text-orange-500" />,
        title: t('incomplete.title'),
        message: t('incomplete.message', { answeredCount, total }),
        color: 'text-orange-600 dark:text-orange-400',
      };
    }
    if (score === 0 && answeredCount === 0) {
      return {
        icon: <Clock className="h-14 w-14 text-gray-500" />,
        title: t('timeUp.title'),
        message: t('timeUp.message'),
        color: 'text-gray-600 dark:text-gray-400',
      };
    }

    if (score === 0 && answeredCount > 0) {
      return {
        icon: <BookOpen className="h-14 w-14 text-red-500" />,
        title: t('allWrong.title'),
        message: t('allWrong.message'),
        color: 'text-red-600 dark:text-red-400',
      };
    }

    if (percentage < 50) {
      return {
        icon: <BookOpen className="h-14 w-14 text-red-500" />,
        title: t('needPractice.title'),
        message: t('needPractice.message'),
        color: 'text-red-600 dark:text-red-400',
      };
    } else if (percentage < 80) {
      return {
        icon: <TrendingUp className="h-14 w-14 text-orange-500" />,
        title: t('goodJob.title'),
        message: t('goodJob.message'),
        color: 'text-orange-600 dark:text-orange-400',
      };
    } else {
      return {
        icon: <Trophy className="h-14 w-14 text-amber-500" />,
        title: t('excellent.title'),
        message: t('excellent.message'),
        color: 'text-green-600 dark:text-green-400',
      };
    }
  };

  const motivation = getMotivationalMessage();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex justify-center">{motivation.icon}</div>
      {!isIncomplete && (
        <>
          <div className="space-y-2 text-center">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              {score} / {total}
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              {percentage.toFixed(0)}% {t('correctAnswers')}
            </p>
          </div>
          <div className="space-y-2">
            <div className="h-4 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <div
                className={cn(
                  'h-full transition-all duration-1000 ease-out',
                  percentage < 50 && 'bg-red-500',
                  percentage >= 50 && percentage < 80 && 'bg-orange-500',
                  percentage >= 80 && 'bg-green-500'
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </>
      )}
      <div className="space-y-2 text-center">
        <h3 className={cn('text-xl font-semibold', motivation.color)}>
          {motivation.title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400">{motivation.message}</p>
      </div>
      {violationsCount >= 4 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
          <p className="text-center font-medium text-orange-800 dark:text-orange-200">
            <TriangleAlert className="inline h-4 w-4" aria-hidden="true" />{' '}
            {t('violations', { count: violationsCount })}
          </p>
        </div>
      )}
      {!isGuest && pointsAwarded !== null && pointsAwarded !== undefined && (
        <div
          className={`rounded-xl border p-4 ${
            pointsAwarded > 0
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
              : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20'
          }`}
        >
          <p
            className={`text-center font-medium ${
              pointsAwarded > 0
                ? 'text-green-800 dark:text-green-200'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {pointsAwarded > 0
              ? t('pointsAwarded', { points: pointsAwarded })
              : violationsCount >= 4
                ? t('disqualified')
                : t('noPointsAwarded')}
          </p>
        </div>
      )}
      {isGuest && !isIncomplete ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-center font-medium text-blue-800 dark:text-blue-200">
              {t('guestMessage')}
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              onClick={() => {
                const url = `/${locale}/login?returnTo=/dashboard`;
                window.location.href = url;
              }}
            >
              {t('loginButton')}
            </Button>
            <Button
              onClick={() =>
                (window.location.href = `/${locale}/signup?returnTo=/dashboard`)
              }
              variant="secondary"
            >
              {t('signupButton')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={onRestart} variant="primary">
            {t('retryButton')}
          </Button>
          {!isGuest && attemptId && score < total && (
            <Button
              onClick={() => (window.location.href = `/${locale}/dashboard/quiz-review/${attemptId}`)}
              variant="secondary"
            >
              {t('reviewButton')}
            </Button>
          )}
          <Button onClick={onBackToTopics} variant="secondary">
            {t('backButton')}
          </Button>
        </div>
      )}
    </div>
  );
}
