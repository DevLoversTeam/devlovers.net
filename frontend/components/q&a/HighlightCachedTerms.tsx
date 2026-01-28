'use client';

import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface HighlightCachedTermsProps {
  text: string;
  cachedTerms: Set<string>;
  onTermClick?: (term: string) => void;
  className?: string;
}

export default function HighlightCachedTerms({
  text,
  cachedTerms,
  onTermClick,
  className,
}: HighlightCachedTermsProps) {
  const segments = useMemo(() => {
    if (cachedTerms.size === 0) {
      return [{ text, isCached: false }];
    }

    const sortedTerms = Array.from(cachedTerms).sort(
      (a, b) => b.length - a.length
    );

    const escapedTerms = sortedTerms.map(term =>
      term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );

    if (escapedTerms.length === 0) {
      return [{ text, isCached: false }];
    }

    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

    const result: { text: string; isCached: boolean; originalTerm?: string }[] =
      [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({
          text: text.slice(lastIndex, match.index),
          isCached: false,
        });
      }

      result.push({
        text: match[0],
        isCached: true,
        originalTerm: match[0].toLowerCase().trim(),
      });

      lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({
        text: text.slice(lastIndex),
        isCached: false,
      });
    }

    return result.length > 0 ? result : [{ text, isCached: false }];
  }, [text, cachedTerms]);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (!segment.isCached) {
          return <React.Fragment key={index}>{segment.text}</React.Fragment>;
        }

        return (
          <span
            key={index}
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onTermClick?.(segment.originalTerm || segment.text);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onTermClick?.(segment.originalTerm || segment.text);
              }
            }}
            className={cn(
              'cursor-pointer',
              'border-b border-dashed border-emerald-500/60',
              'bg-emerald-50/50 dark:bg-emerald-900/20',
              'hover:bg-emerald-100 dark:hover:bg-emerald-900/40',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-1',
              'transition-colors duration-150',
              'rounded-sm px-0.5 -mx-0.5'
            )}
            title="Click to see explanation (cached)"
          >
            {segment.text}
          </span>
        );
      })}
    </span>
  );
}
