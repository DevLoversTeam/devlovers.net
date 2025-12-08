'use client';

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

export function QuizProgress({ current, total, answers }: QuizProgressProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Питання {current + 1} / {total}
        </span>
      </div>

      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, index) => {
          const answer = answers.find((a, i) => i === index);
          const isCurrent = index === current;
          const isAnswered = answer !== undefined;
          const isCorrect = answer?.isCorrect;

          return (
            <div key={index} className="flex items-center">
              <div
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-full transition-all border-2',

                  isCurrent &&
                    !isAnswered &&
                    'border-blue-500 bg-blue-50 dark:bg-blue-950',
                  isAnswered && isCorrect && 'border-green-500 bg-green-500',
                  isAnswered && !isCorrect && 'border-red-500 bg-red-500',
                  !isAnswered &&
                    !isCurrent &&
                    'border-gray-300 bg-white dark:bg-gray-900'
                )}
              >
                {isAnswered && isCorrect && (
                  <span className="text-white font-bold text-sm">✓</span>
                )}
                {isAnswered && !isCorrect && (
                  <span className="text-white font-bold text-sm">✗</span>
                )}
                {!isAnswered && (
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isCurrent
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-400'
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                {isCurrent && (
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500 animate-pulse" />
                )}
              </div>
              {index < total - 1 && (
                <div className="w-4 h-0.5 bg-gray-300 dark:bg-gray-700 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
