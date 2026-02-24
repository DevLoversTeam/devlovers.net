'use client';

import { BookOpen, Check, ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import ExplanationRenderer from '@/components/quiz/ExplanationRenderer';
import { cn } from '@/lib/utils';
import type { AttemptQuestionDetail } from '@/types/quiz';

interface QuizReviewCardProps {
  question: AttemptQuestionDetail;
  index: number;
  accentColor?: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function QuizReviewCard({
  question,
  index,
  accentColor,
  isOpen,
  onToggle,
}: QuizReviewCardProps) {
  const t = useTranslations('dashboard.quizReview');

  return (
    <div className="rounded-2xl border border-gray-100 bg-white/60 backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left sm:p-6"
      >
        <ChevronDown
          className={cn(
            'h-5 w-5 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          style={{ color: accentColor }}
        />
        <div className="min-w-0 flex-1 text-lg font-medium text-gray-900 dark:text-gray-100">
          <span className="mr-2" style={{ color: accentColor }}>
            #{index}
          </span>
          {question.questionText}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 pt-0 pb-4 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-3">
            {question.answers.map(answer => {
              const isUserWrong = answer.isSelected && !answer.isCorrect;
              const isCorrectAnswer = answer.isCorrect;

              return (
                <div
                  key={answer.id}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3',
                    isCorrectAnswer && 'border-green-500',
                    isUserWrong && 'border-red-500',
                    !isCorrectAnswer &&
                      !isUserWrong &&
                      'border-gray-100 dark:border-white/5'
                  )}
                >
                  <span className="flex-1 text-base text-gray-700 dark:text-gray-300">
                    {answer.answerText}
                  </span>
                  {isCorrectAnswer && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      <Check className="inline h-4 w-4" aria-hidden="true" />{' '}
                      {t('correctAnswer')}
                    </span>
                  )}
                  {isUserWrong && (
                    <span className="text-sm font-medium text-red-600 dark:text-red-400">
                      <X className="inline h-4 w-4" aria-hidden="true" />{' '}
                      {t('yourAnswer')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {question.explanation && (
            <div
              className="mt-4 rounded-xl border p-4"
              style={{ borderColor: accentColor }}
            >
              <div className="flex items-start gap-3">
                <BookOpen
                  className="h-5 w-5 shrink-0"
                  style={{ color: accentColor }}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <h4 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
                    {t('explanation')}
                  </h4>
                  <ExplanationRenderer blocks={question.explanation} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
