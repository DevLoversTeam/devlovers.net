'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  timeLimitSeconds: number;
  onTimeUp: () => void;
  isActive: boolean;
  startedAt: Date;
}

export function CountdownTimer({
  timeLimitSeconds,
  onTimeUp,
  isActive,
  startedAt,
}: CountdownTimerProps) {
  const t = useTranslations('quiz.timer');
  const endTime = startedAt.getTime() + timeLimitSeconds * 1000;
  const [remainingSeconds, setRemainingSeconds] = useState(() => 
    Math.max(0, Math.floor((endTime - Date.now()) / 1000))
  );
  
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      
      setRemainingSeconds(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        queueMicrotask(onTimeUp);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, onTimeUp, endTime]);

  // Force update when tab becomes visible again
  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
        setRemainingSeconds(remaining);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, endTime]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const percentage = (remainingSeconds / timeLimitSeconds) * 100;

  const getColorClasses = () => {
    if (percentage <= 10) {
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    }
    if (percentage <= 30) {
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
    }
    return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
  };

  const getProgressBarColor = () => {
    if (percentage <= 10) return 'bg-red-600';
    if (percentage <= 30) return 'bg-yellow-600';
    return 'bg-blue-600';
  };

  if (!isActive) return null;

  return (
    <div className={cn(
      'rounded-lg border-2 p-4 transition-all',
      getColorClasses(),
      percentage <= 10 && 'animate-pulse'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{t('label')}</span>
        <span className="text-2xl font-bold font-mono">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-1000 ease-linear',
            getProgressBarColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {percentage <= 30 && (
        <p className="text-xs mt-2 font-medium">
          {percentage <= 10 ? (
            <>
              <span aria-hidden="true">⚠️</span> {t('almostDone')}
            </>
          ) : (
            <>
              <span aria-hidden="true">⏰</span> {t('hurryUp')}
            </>
          )}
        </p>
      )}
    </div>
  );
}
