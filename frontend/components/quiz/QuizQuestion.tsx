'use client';
import { BookOpen, Check, Lightbulb, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { QuizQuestionClient } from '@/db/queries/quizzes/quiz';
import { cn } from '@/lib/utils';

import ExplanationRenderer from './ExplanationRenderer';

interface QuizQuestionProps {
  question: QuizQuestionClient;
  status: 'answering' | 'revealed';
  selectedAnswerId: string | null;
  isCorrect: boolean;
  onAnswer: (answerId: string) => void;
  onNext: () => void;
  isLoading?: boolean;
  accentColor?: string;
}

export function QuizQuestion({
  question,
  status,
  selectedAnswerId,
  isCorrect,
  onAnswer,
  onNext,
  isLoading = false,
  accentColor,
}: QuizQuestionProps) {
  const t = useTranslations('quiz.question');
  const isAnswering = status === 'answering';
  const isRevealed = status === 'revealed';

  const isCorrectAnswer = isRevealed && isCorrect;

  const nextButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isRevealed) {
      nextButtonRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [isRevealed]);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xl font-medium text-gray-900 dark:text-gray-100">
        {question.questionText}
      </div>
      <RadioGroup
        value={selectedAnswerId ?? ''}
        onValueChange={onAnswer}
        disabled={!isAnswering || isLoading}
        className="gap-3"
      >
        {question.answers.map(answer => {
          const isSelected = selectedAnswerId === answer.id;
          const showCorrect = isRevealed && isSelected && isCorrect;
          const showIncorrect = isRevealed && isSelected && !isCorrect;

          return (
            <label
              key={answer.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                'hover:bg-gray-50 dark:hover:bg-gray-800',
                isSelected &&
                  isAnswering &&
                  'border-blue-500 bg-blue-50 dark:bg-blue-950',
                showCorrect && 'border border-green-500',
                showIncorrect && 'border border-red-500',
                !isAnswering && 'cursor-default'
              )}
            >
              <RadioGroupItem value={answer.id} />
              <span className="flex-1 text-base">{answer.answerText}</span>
              {showCorrect && (
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  <Check className="inline h-4 w-4" aria-hidden="true" />{' '}
                  {t('correct')}
                </span>
              )}
              {showIncorrect && (
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  <X className="inline h-4 w-4" aria-hidden="true" />{' '}
                  {t('incorrect')}
                </span>
              )}
            </label>
          );
        })}
      </RadioGroup>
      {isRevealed && isCorrectAnswer && question.explanation && (
        <div
          className={cn(
            'animate-in fade-in rounded-xl border p-4 duration-300',
            'border border-blue-500 dark:border-blue-500'
          )}
        >
          <div className="flex items-start gap-3">
            <BookOpen
              className="h-6 w-6 shrink-0 text-blue-500"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h4 className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
                {t('explanationLabel')}
              </h4>
              <ExplanationRenderer blocks={question.explanation} />
            </div>
          </div>
        </div>
      )}
      {isRevealed && !isCorrectAnswer && (
        <div
          className={cn(
            'animate-in fade-in rounded-xl border p-4 duration-300',
            'border border-orange-500 dark:border-orange-500'
          )}
        >
          <div className="flex items-start gap-3">
            <Lightbulb
              className="h-6 w-6 shrink-0 text-amber-500"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h4 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                {t('recommendation.title')}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('recommendation.description')}
              </p>
            </div>
          </div>
        </div>
      )}
      {isRevealed && (
        <button
          ref={nextButtonRef}
          onClick={onNext}
          disabled={isLoading}
          className="group animate-in fade-in slide-in-from-bottom-2 relative mt-2 w-full overflow-hidden rounded-xl border px-6 py-3 text-center text-base font-semibold transition-all duration-300 disabled:opacity-50"
          style={{
            borderColor: `${accentColor}50`,
            backgroundColor: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {isLoading ? t('loading') : t('nextButton')}
          <span
            className="pointer-events-none absolute top-1/2 left-1/2 h-[150%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 blur-[20px] transition-opacity duration-300 group-hover:opacity-30"
            style={{ backgroundColor: accentColor }}
          />
        </button>
      )}
    </div>
  );
}
