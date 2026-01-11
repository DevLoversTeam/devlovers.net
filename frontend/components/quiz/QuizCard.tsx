'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';

interface QuizCardProps {
  quiz: {
    id: string;
    slug: string;
    title: string | null;
    description: string | null;
    questionsCount: number;
    timeLimitSeconds: number | null;
    categoryName: string | null;
  };
  userProgress?: {
    bestScore: number;
    totalQuestions: number;
    attemptsCount: number;
  } | null;
}

export function QuizCard({ quiz, userProgress }: QuizCardProps) {
  const t = useTranslations('quiz.card');
  const percentage = userProgress && userProgress.totalQuestions > 0
    ? Math.round((userProgress.bestScore / userProgress.totalQuestions) * 100)
    : 0;

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-grow">
      <div className="flex gap-2 mb-3">
        <Badge variant="blue">{quiz.categoryName ?? t('uncategorized')}</Badge>
        {userProgress && (
          <Badge variant="success">{t('completed')}</Badge>
        )}
      </div>
      <h2 className="text-xl font-semibold mb-2">
        {quiz.title ?? quiz.slug}
      </h2>
      {quiz.description && (
        <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
          {quiz.description}
        </p>
      )}
      <div className="flex gap-3 text-xs text-gray-500 mb-3">
        <span>📝 {quiz.questionsCount} {t('questions')}</span>
        <span>
          ⏱️ {Math.floor((quiz.timeLimitSeconds ?? quiz.questionsCount * 30) / 60)} {t('min')}
        </span>
      </div>
      </div>
      {userProgress && (
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1.5">
            <div className="flex flex-row items-center gap-2">
              <span className="text-gray-600 dark:text-gray-400">
              Best: {userProgress.bestScore}/{userProgress.totalQuestions}
              </span>
              <p className="text-xs text-gray-500">
                {userProgress.attemptsCount} {userProgress.attemptsCount === 1 ? 'attempt' : 'attempts'}
              </p>
            </div>
            <span className="text-gray-600 dark:text-gray-400">
              {t('best')} {userProgress.bestScore}/{userProgress.totalQuestions}
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {percentage}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {userProgress.attemptsCount} {userProgress.attemptsCount === 1 ? t('attempt') : t('attempts')}
          </p>
        </div>
      )}
      <Link
        href={`/quiz/${quiz.slug}`}
        className="block w-full text-center rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-500 transition-colors"
      >
        {userProgress ? t('retake') : t('start')}
      </Link>
    </div>
  );
}
