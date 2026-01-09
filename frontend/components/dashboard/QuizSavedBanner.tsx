'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing'

interface SavedQuizInfo {
  score: number;
  total: number;
  percentage: number;
  pointsAwarded: number;
  quizSlug: string;
}

export function QuizSavedBanner() {
  const [info, setInfo] = useState<SavedQuizInfo | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('quiz_just_saved');
    if (saved) {
       try {
       setInfo(JSON.parse(saved));
        sessionStorage.removeItem('quiz_just_saved');
     } catch (error) {
       console.error('Failed to parse quiz_just_saved from sessionStorage:', error);
      sessionStorage.removeItem('quiz_just_saved');
    }
    }
  }, []);

  if (!info) return null;

  return (
    <div className="mb-6 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
      <div className="text-center space-y-2">
        <p className="text-green-800 dark:text-green-200 font-medium text-lg">
          🎉 Результат квізу збережено!
        </p>
        <p className="text-green-700 dark:text-green-300">
          Ви набрали <strong>{info.score}/{info.total}</strong> ({info.percentage.toFixed(0)}%)
          {info.pointsAwarded > 0 && (
            <> • <strong>+{info.pointsAwarded} балів</strong> додано до рейтингу</>
          )}
          {info.pointsAwarded === 0 && (
            <> • Бали не нараховано (результат не покращено)</>
          )}
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link 
            href="/leaderboard" 
            className="text-green-600 dark:text-green-400 underline hover:no-underline"
          >
            Переглянути рейтинг
          </Link>
          <Link 
            href={`/quiz/${info.quizSlug}`}
            className="text-green-600 dark:text-green-400 underline hover:no-underline"
          >
            Пройти ще раз
          </Link>
        </div>
      </div>
    </div>
  );
}