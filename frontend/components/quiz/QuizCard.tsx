'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { FileText, Clock } from 'lucide-react';
import { categoryTabStyles } from '@/data/categoryStyles';

interface QuizCardProps {
  quiz: {
    id: string;
    slug: string;
    title: string | null;
    description: string | null;
    questionsCount: number;
    timeLimitSeconds: number | null;
    categoryName: string | null;
    categorySlug: string | null;
  };
  userProgress?: {
    bestScore: number;
    totalQuestions: number;
    attemptsCount: number;
  } | null;
}

export function QuizCard({ quiz, userProgress }: QuizCardProps) {
  const t = useTranslations('quiz.card');
  const slug = quiz.categorySlug as keyof typeof categoryTabStyles | null;
  const style = slug && categoryTabStyles[slug] ? categoryTabStyles[slug] : null;
  const accentColor = style?.accent ?? '#3B82F6'; // fallback blue

  const percentage =
    userProgress && userProgress.totalQuestions > 0
      ? Math.round((userProgress.bestScore / userProgress.totalQuestions) * 100)
      : 0;

  return (
    <div 
      className="group/card relative flex flex-col rounded-xl border border-black/10 dark:border-white/10 hover:!border-[var(--accent)] bg-white dark:bg-neutral-900 p-5 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ '--accent': `${accentColor}60` } as React.CSSProperties}
    >
      <span
        className="pointer-events-none absolute -top-6 -right-6 w-24 h-24 rounded-full blur-[40px] opacity-0 group-hover/card:opacity-20 transition-opacity duration-500"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex-grow">
        <div className="flex gap-2 mb-3">
          <Badge
            variant="default"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor,
            }}
          >
            {quiz.categoryName ?? t('uncategorized')}
          </Badge>
          {userProgress && <Badge variant="success">{t('completed')}</Badge>}
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
          <span className="flex items-center gap-1">
           <FileText className="w-3.5 h-3.5" style={{ color: accentColor }} />
            {quiz.questionsCount} {t('questions')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" style={{ color: accentColor }} />
            {Math.floor(
              (quiz.timeLimitSeconds ?? quiz.questionsCount * 30) / 60
            )}{' '}
            {t('min')}
          </span>
        </div>
      </div>
      {userProgress && (
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-600 dark:text-gray-400">
              {t('best')} {userProgress.bestScore}/{userProgress.totalQuestions}
            </span>
            <span className="text-gray-500">
              {userProgress.attemptsCount}{' '}
              {userProgress.attemptsCount === 1 ? t('attempt') : t('attempts')}
            </span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {percentage}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percentage}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      )}
      <Link
        href={`/quiz/${quiz.slug}`}
        className="group relative block w-full overflow-hidden text-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-300"
        style={{
          borderColor: `${accentColor}50`,
          backgroundColor: `${accentColor}15`,
          color: accentColor,
        }}
      >
        {userProgress ? t('retake') : t('start')}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-30"
          style={{ backgroundColor: accentColor }}
        />
      </Link>
    </div>
  );
}
