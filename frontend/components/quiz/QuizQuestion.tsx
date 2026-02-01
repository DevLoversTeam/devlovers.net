'use client';

import { useTranslations } from 'next-intl';
import { QuizQuestionClient } from '@/db/queries/quiz';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import ExplanationRenderer from './ExplanationRenderer';
import { cn } from '@/lib/utils';
import { Check, X, Lightbulb } from 'lucide-react';

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
                'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                'hover:bg-gray-50 dark:hover:bg-gray-800',
                isSelected &&
                  isAnswering &&
                  'border-blue-500 bg-blue-50 dark:bg-blue-950',
                showCorrect && 'border-1 border-green-500',
                showIncorrect && 'border-1 border-red-500',
                !isAnswering && 'cursor-default'
              )}
            >
              <RadioGroupItem value={answer.id} />
              <span className="flex-1 text-base">{answer.answerText}</span>
              {showCorrect && (
                <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                  <Check className="w-4 h-4 inline" aria-hidden="true"/> {t('correct')}
                </span>
              )}
              {showIncorrect && (
                <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                 <X className="w-4 h-4 inline" aria-hidden="true"/> {t('incorrect')}
                </span>
              )}
            </label>
          );
        })}
      </RadioGroup>
      {isRevealed && isCorrectAnswer && question.explanation && (
        <div
          className={cn(
            'rounded-xl border p-4 animate-in fade-in duration-300',
            'border-1 border-blue-500 dark:border-blue-500'
          )}
        >
          <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('explanationLabel')}
          </div>
          <ExplanationRenderer blocks={question.explanation} />
        </div>
      )}
      {isRevealed && !isCorrectAnswer && (
        <div
          className={cn(
            'rounded-xl border p-4 animate-in fade-in duration-300',
            'border-1 border-orange-500 dark:border-orange-500'
          )}
        >
          <div className="flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-amber-500 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
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
          onClick={onNext}
          disabled={isLoading}
          className="group relative mt-2 w-full overflow-hidden text-center rounded-xl border px-6 py-3 text-base font-semibold transition-all duration-300 disabled:opacity-50 animate-in fade-in slide-in-from-bottom-2"
          style={{
            borderColor: `${accentColor}50`,
            backgroundColor: `${accentColor}15`,
            color: accentColor,
          }}
        >
          {isLoading ? t('loading') : t('nextButton')}
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 h-[150%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[20px] opacity-0 transition-opacity duration-300 group-hover:opacity-30"
            style={{ backgroundColor: accentColor }}
          />
        </button>
      )}
    </div>
  );
}
