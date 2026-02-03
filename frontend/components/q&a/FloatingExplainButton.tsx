'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

interface FloatingExplainButtonProps {
  position: { x: number; y: number };
  onClick: () => void;
  onDismiss: () => void;
}

export default function FloatingExplainButton({
  position,
  onClick,
  onDismiss,
}: FloatingExplainButtonProps) {
  const t = useTranslations('aiHelper');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    const handleScroll = () => {
      onDismissRef.current();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        onDismissRef.current();
      }
    };

    const timeoutId = setTimeout(() => {
      window.addEventListener('scroll', handleScroll, true);
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'fixed z-50',
        'px-3 py-1.5',
        'text-sm font-medium',
        'bg-[var(--accent-primary)] text-white',
        'rounded-full',
        'border border-transparent',
        'shadow-lg',
        'hover:bg-[var(--accent-hover)]',
        'transition-all duration-200',
        'animate-in fade-in-0 zoom-in-95',
        'focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:outline-none'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%) translateY(-8px)',
      }}
      aria-label={t('buttonText')}
    >
      {t('buttonText')}
    </button>
  );
}
