'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface Answer {
  questionId: string;
  isCorrect: boolean;
}

interface QuizProgressProps {
  current: number;
  total: number;
  answers: Answer[];
}

function getVisibleIndices(
  current: number,
  total: number
): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }

  const indices: (number | 'ellipsis')[] = [];
  const neighbors = 2;

  const start = Math.max(1, current - neighbors);
  const end = Math.min(total - 2, current + neighbors);

  indices.push(0);

  if (start > 1) {
    indices.push('ellipsis');
  }

  for (let i = start; i <= end; i++) {
    if (i !== 0 && i !== total - 1) {
      indices.push(i);
    }
  }

  if (end < total - 2) {
    indices.push('ellipsis');
  }

  indices.push(total - 1);

  return indices;
}

export function QuizProgress({ current, total, answers }: QuizProgressProps) {
  const t = useTranslations('quiz.progress');
  const visibleIndices = getVisibleIndices(current, total);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {t('label', { current: current + 1, total })}
        </span>
      </div>

      <div className="flex items-center justify-center gap-1">
        {visibleIndices.map((item, idx) => {
          if (item === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="px-2 text-sm text-gray-400 dark:text-gray-500"
              >
                …
              </span>
            );
          }

          const index = item;
          const answer = answers[index];
          const isCurrent = index === current;
          const isAnswered = answer !== undefined;
          const isCorrect = answer?.isCorrect;

          return (
            <div
              key={index}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-all',
                isCurrent &&
                  !isAnswered &&
                  'border-blue-500 bg-blue-500/20 dark:bg-blue-500/20',
                isAnswered &&
                  isCorrect &&
                  'border-green-500 bg-green-500/20 dark:bg-green-500/20',
                isAnswered &&
                  !isCorrect &&
                  'border-red-500 bg-red-500/20 dark:bg-red-500/20',
                !isAnswered &&
                  !isCurrent &&
                  'border-gray-300 bg-white/90 dark:border-gray-600 dark:bg-neutral-900/80'
              )}
            >
              {isAnswered ? (
                <span className="font-bold text-white">
                  {isCorrect ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <X className="h-3 w-3" aria-hidden="true" />
                  )}
                </span>
              ) : (
                <span
                  className={cn(
                    isCurrent
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-400'
                  )}
                >
                  {index + 1}
                </span>
              )}
              {isCurrent && (
                <div
                  className={cn(
                    'absolute inset-0 animate-pulse rounded-full border-1',
                    !isAnswered && 'border-blue-500',
                    isAnswered && isCorrect && 'border-green-500',
                    isAnswered && !isCorrect && 'border-red-500'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
