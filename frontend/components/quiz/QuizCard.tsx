'use client';

import { Clock, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { categoryTabStyles } from '@/data/categoryStyles';
import { useRouter } from '@/i18n/routing';

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

function makeSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

export function QuizCard({ quiz, userProgress }: QuizCardProps) {
  const router = useRouter();
  const t = useTranslations('quiz.card');
  const slug = quiz.categorySlug as keyof typeof categoryTabStyles | null;
  const style =
    slug && categoryTabStyles[slug] ? categoryTabStyles[slug] : null;
  const accentColor = style?.accent ?? '#3B82F6';

  const percentage =
    userProgress && userProgress.totalQuestions > 0
      ? Math.round((userProgress.bestScore / userProgress.totalQuestions) * 100)
      : 0;

  const getStatusBadge = () => {
    if (!userProgress) return null;
    if (percentage === 100)
      return { variant: 'success' as const, label: t('mastered'), dot: 'bg-emerald-500' };
    if (percentage >= 70)
      return { variant: 'warning' as const, label: t('needsReview'), dot: 'bg-amber-500' };
    return { variant: 'danger' as const, label: t('study'), dot: 'bg-red-500' };
  };

  const statusBadge = getStatusBadge();


    const handleStart = () => {
    const seed = makeSeed(); // runs on click, not render
    router.push(`/quiz/${quiz.slug}?seed=${seed}`);
  };

  return (
    <div
      className="group/card relative flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:!border-[var(--accent)] hover:shadow-xl dark:border-white/10 dark:bg-neutral-900"
      style={{ '--accent': `${accentColor}60` } as React.CSSProperties}
    >
      <span
        className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-0 blur-[40px] transition-opacity duration-500 group-hover/card:opacity-20"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex-grow">
        <div className="mb-3 flex gap-2">
          <Badge
            variant="default"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor,
            }}
          >
            {quiz.categoryName ?? t('uncategorized')}
          </Badge>
          {statusBadge && (
          <Badge variant={statusBadge.variant} className="gap-1.5 rounded-full">
            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dot}`} />
            {statusBadge.label}
          </Badge>
        )}
        </div>
        <h2 className="mb-2 text-xl font-semibold">
          {quiz.title ?? quiz.slug}
        </h2>
        {quiz.description && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
            {quiz.description}
          </p>
        )}
        <div className="mb-3 flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" style={{ color: accentColor }} />
            {quiz.questionsCount} {t('questions')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" style={{ color: accentColor }} />
            {Math.floor(
              (quiz.timeLimitSeconds ?? quiz.questionsCount * 30) / 60
            )}{' '}
            {t('min')}
          </span>
        </div>
      </div>
      {userProgress && (
        <div className="mb-6">
          <div className="mb-1.5 flex justify-between text-xs">
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
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percentage}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>
      )}
      <button
        type="button" onClick={handleStart} 
        className="group relative block w-full overflow-hidden rounded-xl border px-4 py-2.5 text-center text-sm font-semibold transition-all duration-300"
        style={{
          borderColor: `${accentColor}50`,
          backgroundColor: `${accentColor}15`,
          color: accentColor,
        }}
      >
        {userProgress ? t('retake') : t('start')}
        <span
          className="pointer-events-none absolute top-1/2 left-1/2 h-[150%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-[20px] transition-opacity duration-300 group-hover:opacity-30"
          style={{ backgroundColor: accentColor }}
        />
      </button>
    </div>
  );
}
