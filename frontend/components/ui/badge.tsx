import * as React from 'react';

import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | 'default'
    | 'success'
    | 'blue'
    | 'purple'
    | 'gray'
    | 'warning'
    | 'danger';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',

          variant === 'default' &&
            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
          variant === 'success' &&
            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          variant === 'blue' &&
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
          variant === 'purple' &&
            'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
          variant === 'gray' &&
            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          variant === 'warning' &&
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
          variant === 'danger' &&
            'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge };
