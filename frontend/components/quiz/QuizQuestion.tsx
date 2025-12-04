'use client';

  import { QuizQuestionWithAnswers } from '@/db/queries/quiz';
  import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
  import { Button } from '@/components/ui/button';
  import ExplanationRenderer from './ExplanationRenderer';
  import { cn } from '@/lib/utils';

  interface QuizQuestionProps {
    question: QuizQuestionWithAnswers;
    status: 'answering' | 'revealed';
    selectedAnswerId: string | null;
    onAnswer: (answerId: string) => void;
    onNext: () => void;
    isLoading?: boolean;
  }

  export function QuizQuestion({
    question,
    status,
    selectedAnswerId,
    onAnswer,
    onNext,
    isLoading = false,
  }: QuizQuestionProps) {
    const isAnswering = status === 'answering';
    const isRevealed = status === 'revealed';

    // Find correct answer for revealed state
    const correctAnswer = question.answers.find((a) => a.isCorrect);
    const isCorrectAnswer =
      isRevealed && selectedAnswerId === correctAnswer?.id;

    return (
      <div className="flex flex-col gap-6">
        {/* Question text */}
        <div className="text-xl font-medium text-gray-900 dark:text-gray-100">
          {question.questionText}
        </div>

        {/* Answer options */}
        <RadioGroup
          value={selectedAnswerId || undefined}
          onValueChange={onAnswer}
          disabled={!isAnswering || isLoading}
          className="gap-3"
        >
          {question.answers.map((answer) => {
            const isSelected = selectedAnswerId === answer.id;
            const showCorrect = isRevealed && isCorrectAnswer && isSelected;
            const showIncorrect = isRevealed && !isCorrectAnswer && isSelected;

            return (
              <label
                key={answer.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                  'hover:bg-gray-50 dark:hover:bg-gray-800',
                  isSelected &&
                    isAnswering &&
                    'border-blue-500 bg-blue-50 dark:bg-blue-950',
                  showCorrect &&
                    'border-green-500 bg-green-50 dark:bg-green-950',
                  showIncorrect && 'border-red-500 bg-red-50 dark:bg-red-950',
                  !isAnswering && 'cursor-default'
                )}
              >
                <RadioGroupItem value={answer.id} />
                <span className="flex-1 text-base">{answer.answerText}</span>

                {/* Status indicator */}
                {showCorrect && (
                  <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                    ✓ Правильно
                  </span>
                )}
                {showIncorrect && (
                  <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                    ✗ Неправильно
                  </span>
                )}
              </label>
            );
          })}
        </RadioGroup>

        {/* Correct answer: Show explanation */}
        {isRevealed && isCorrectAnswer && question.explanation && (
          <div
            className={cn(
              'rounded-xl border p-4 animate-in fade-in duration-300',
              'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
            )}
          >
            <div className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Пояснення:
            </div>
            <ExplanationRenderer blocks={question.explanation} />
          </div>
        )}

        {/* Incorrect answer: Show motivational message */}
        {isRevealed && !isCorrectAnswer && (
          <div
            className={cn(
              'rounded-xl border p-4 animate-in fade-in duration-300',
              'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
            )}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">💡</div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Рекомендація
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Рекомендуємо повторити цю тему після завершення квізу
                </p>
              </div>
            </div>
          </div>
        )}
        {/* Next button (shown for both correct and incorrect) */}
     <Button
      onClick={onNext}
      disabled={isLoading}
      className="mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      {isLoading ? 'Завантаження...' : 'Далі'}
    </Button>
      </div>
    );
  }