 'use client';

  import { cn } from '@/lib/utils';

  interface QuizResultProps {
    score: number;
    total: number;
    percentage: number;
    onRestart: () => void;
    onBackToTopics: () => void;
  }

  export function QuizResult({
    score,
    total,
    percentage,
    onRestart,
    onBackToTopics,
  }: QuizResultProps) {
    // Determine motivational message based on score
    const getMotivationalMessage = () => {
      if (percentage < 50) {
        return {
          emoji: '📚',
          title: 'Потрібно більше практики',
          message: 'Рекомендуємо приділити більше часу теорії та практиці',
          color: 'text-red-600 dark:text-red-400',
        };
      } else if (percentage < 80) {
        return {
          emoji: '💪',
          title: 'Непоганий результат!',
          message: 'Повторіть складні теми та спробуйте ще раз',
          color: 'text-orange-600 dark:text-orange-400',
        };
      } else {
        return {
          emoji: '🎉',
          title: 'Чудова робота!',
          message: 'Ви добре засвоїли матеріал',
          color: 'text-green-600 dark:text-green-400',
        };
      }
    };

    const motivation = getMotivationalMessage();

    return (
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Emoji */}
        <div className="text-center text-6xl">{motivation.emoji}</div>

        {/* Score display */}
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
            {score} / {total}
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            {percentage.toFixed(0)}% правильних відповідей
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
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

        {/* Motivational message */}
        <div className="text-center space-y-2">
          <h3 className={cn('text-xl font-semibold', motivation.color)}>
            {motivation.title}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">{motivation.message}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onRestart}
            className={cn(
              'px-6 py-3 rounded-xl font-medium transition-colors',
              'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
            )}
          >
            Спробувати ще раз
          </button>
          <button
            onClick={onBackToTopics}
            className={cn(
              'px-6 py-3 rounded-xl font-medium transition-colors',
              'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
              'hover:bg-gray-300 dark:hover:bg-gray-700'
            )}
          >
            Повернутись до тем
          </button>
        </div>
      </div>
    );
  }