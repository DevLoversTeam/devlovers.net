'use client';

import { Link } from '@/i18n/routing';
import type { LucideIcon } from 'lucide-react';

interface HeaderButtonProps {
  href?: string;
  onClick?: () => void;

  icon?: LucideIcon;
  children?: React.ReactNode;

  variant?: 'icon' | 'default';
  showArrow?: boolean;

  label?: string;

  className?: string;
}

export function HeaderButton({
  href,
  onClick,
  icon: Icon,
  children,
  variant = 'default',
  showArrow = false,
  label,
  className = '',
}: HeaderButtonProps) {
  const isIconOnly = variant === 'icon';

  const ArrowIcon = showArrow ? (
    <svg
      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-active:translate-x-1"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  ) : null;

  const content = (
    <>
      <span
        className="
          absolute inset-0
          opacity-0 group-hover:opacity-100 group-active:opacity-100
          transition-opacity duration-500 ease-out
        "
        style={{
          background:
            'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-hover) 100%)',
        }}
        aria-hidden="true"
      />

      <span
        className="
          absolute inset-0
          [--tw-translate-x:-100%]
          group-hover:[--tw-translate-x:100%]
          group-active:[--tw-translate-x:100%]
          transition-transform duration-1000 ease-in-out
          [transform:translateX(var(--tw-translate-x))_skewX(-20deg)]
        "
        style={{
          background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,${
            isIconOnly ? '0.3' : '0.4'
          }) 50%, transparent 100%)`,
        }}
        aria-hidden="true"
      />

      <span
        className={`relative z-10 flex items-center ${
          isIconOnly ? 'justify-center' : 'gap-2'
        }`}
      >
        {Icon && (
          <Icon
            className={`transition-transform duration-300 group-hover:scale-110 group-active:scale-110 ${
              isIconOnly ? 'h-5 w-5' : 'h-4 w-4'
            }`}
          />
        )}
        {children}
        {ArrowIcon}
      </span>
    </>
  );

  const baseClasses = `
    group relative
    inline-flex items-center
    text-sm font-medium
    rounded-lg
    overflow-hidden
    transition-all duration-500 ease-out
    ${
      isIconOnly
        ? 'h-10 w-10 justify-center text-muted-foreground'
        : 'gap-2 px-4 py-2 bg-secondary text-secondary-foreground w-fit'
    }
    hover:text-white
    active:text-white
    ${className}
  `;

  if (!href) {
    return (
      <button
        onClick={onClick}
        className={baseClasses}
        type="button"
        aria-label={label}
        title={label}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={baseClasses}
      aria-label={label}
      title={label}
    >
      {content}
    </Link>
  );
}
