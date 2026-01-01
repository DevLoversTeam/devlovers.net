'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  timeLimitSeconds: number;
  onTimeUp: () => void;
  isActive: boolean;
}

export function CountdownTimer({
  timeLimitSeconds,
  onTimeUp,
  isActive,
}: CountdownTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(timeLimitSeconds);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, onTimeUp]);

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
        <span className="text-sm font-medium">Залишилось часу:</span>
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
          {percentage <= 10 ? '⚠️ Час майже закінчився!' : '⏰ Поспішайте!'}
        </p>
      )}
    </div>
  );
}
