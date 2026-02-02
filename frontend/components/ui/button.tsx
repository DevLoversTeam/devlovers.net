import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
          'disabled:opacity-50 disabled:pointer-events-none',

          variant === 'accent' &&
            'bg-accent text-accent-foreground hover:bg-accent/90',
          variant === 'primary' &&
            'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)] active:brightness-90',
          variant === 'secondary' &&
            'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-700',
          variant === 'outline' &&
            'border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800',

          size === 'sm' && 'px-4 py-2 text-sm',
          size === 'md' && 'px-6 py-3 text-base',
          size === 'lg' && 'px-8 py-4 text-lg',

          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
