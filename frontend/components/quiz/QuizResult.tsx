'use client';

import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface QuizResultProps {
  score: number;
  total: number;
  percentage: number;
  answeredCount: number;
  violationsCount?: number;
  isGuest?: boolean;
  quizSlug?: string;
  pointsAwarded?: number | null;
  onRestart: () => void;
  onBackToTopics: () => void;
}

export function QuizResult({
  score,
  total,
  percentage,
  answeredCount,
  violationsCount = 0,
  pointsAwarded,
  isGuest = false,
  quizSlug = '',
  onRestart,
  onBackToTopics,
}: QuizResultProps) {
  const locale = useLocale();
  const getMotivationalMessage = () => {
    if (score === 0 && answeredCount === 0) {
    return {
      emoji: '⏱️',
      title: 'Час вийшов',
      message: 'Ви не встигли дати жодної відповіді. Спробуйте ще раз і розподіляйте час ефективніше',
      color: 'text-gray-600 dark:text-gray-400',
    };
  }
  
  if (score === 0 && answeredCount > 0) {
    return {
      emoji: '📚',
      title: 'Всі відповіді неправильні',
      message: 'Рекомендуємо ретельно вивчити матеріал перед наступною спробою',
      color: 'text-red-600 dark:text-red-400',
    };
  }

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
      <div className="text-center text-6xl">{motivation.emoji}</div>
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
          {score} / {total}
        </h2>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          {percentage.toFixed(0)}% правильних відповідей
        </p>
      </div>
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
      <div className="text-center space-y-2">
        <h3 className={cn('text-xl font-semibold', motivation.color)}>
          {motivation.title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400">{motivation.message}</p>
      </div>
{violationsCount >= 3 && (
        <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
          <p className="text-center text-orange-800 dark:text-orange-200 font-medium">
            ⚠️ Квіз завершено з порушеннями правил ({violationsCount} порушень).
            Результат не зараховано до рейтингу.
          </p>
        </div>
      )}
      {!isGuest && pointsAwarded !== null && pointsAwarded !== undefined && (
        <div className={`p-4 rounded-xl border ${
          pointsAwarded > 0 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
            : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
        }`}>
          <p className={`text-center font-medium ${
            pointsAwarded > 0 
              ? 'text-green-800 dark:text-green-200' 
              : 'text-gray-600 dark:text-gray-400'
          }`}>
            {pointsAwarded > 0 
              ? `+${pointsAwarded} балів додано до рейтингу` 
              : 'Бали не нараховано (результат не покращено)'}
          </p>
        </div>
      )}
      {isGuest ? (
  <div className="space-y-4">
    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
      <p className="text-center text-blue-800 dark:text-blue-200 font-medium">
        Щоб зберегти результат та потрапити в рейтинг, увійдіть або зареєструйтесь
      </p>
    </div>
<div className="flex flex-col sm:flex-row gap-3 justify-center">
  <Button
    onClick={() => {
  const url = `/${locale}/signup?returnTo=/quiz/${quizSlug}`;
  console.log('Navigating to signup:', url);
  window.location.href = url;
}}
    variant="primary"
  >
    Увійти
  </Button>
  <Button
    onClick={() => window.location.href = `/${locale}/signup?returnTo=/quiz/${quizSlug}`}
    variant="secondary"
  >
    Зареєструватися
  </Button>
</div>
  </div>
) : (
    <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Button onClick={onRestart} variant="primary">
          Спробувати ще раз
        </Button>
        <Button onClick={onBackToTopics} variant="secondary">
          Повернутись до тем
        </Button>
      </div>
)}
    </div>
    );
}
