'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface ViolationsCounterProps {
  count: number;
}

export function ViolationsCounter({ count }: ViolationsCounterProps) {
  const t = useTranslations('quiz.antiCheat');

  const getColorClasses = () => {
    if (count >= 4) {
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    }
    if (count >= 1) {
      return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
    }
    return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium transition-colors',
        getColorClasses(),
        count >= 4 && 'animate-pulse'
      )}
    >
      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
      <span className="sm:hidden">{count}</span>
      <span className="hidden sm:inline">
        {t('counter', { count })}
      </span>
    </div>
  );
}
