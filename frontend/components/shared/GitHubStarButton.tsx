'use client';

import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'github-stars';

function getStoredStars(): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  const parsed = parseInt(stored, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

interface GitHubStarButtonProps {
  className?: string;
}

export function GitHubStarButton({ className = '' }: GitHubStarButtonProps) {
  const t = useTranslations('aria');
  const [displayCount, setDisplayCount] = useState(0);
  const [finalCount, setFinalCount] = useState<number | null>(null);
  const displayCountRef = useRef(displayCount);
  const githubUrl = 'https://github.com/DevLoversTeam/devlovers.net';

  useEffect(() => {
    displayCountRef.current = displayCount;
  }, [displayCount]);

  useEffect(() => {
    const cachedStars = getStoredStars();

    if (cachedStars !== null) {
      const frame = window.requestAnimationFrame(() => {
        setFinalCount(cachedStars);
      });

      return () => window.cancelAnimationFrame(frame);
    }

    const fetchStars = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          const starsStr =
            typeof data?.githubStars === 'string'
              ? data.githubStars
              : String(data?.githubStars ?? '0');
          let starsNum = 0;
          const normalized = starsStr.replace(/,/g, '').toLowerCase();
          if (normalized.includes('k+')) {
            starsNum = Math.floor(
              parseFloat(normalized.replace('k+', '')) * 1000
            );
          } else {
            starsNum = parseInt(normalized, 10);
          }
          setFinalCount(starsNum);
        }
      } catch (error) {
        console.error('Failed to fetch GitHub stars:', error);
        setFinalCount(0);
      }
    };

    fetchStars();
  }, []);

  useEffect(() => {
    if (finalCount === null || finalCount === displayCountRef.current) return;

    const duration = 2000;
    const steps = 60;
    const start = displayCountRef.current;
    const increment = Math.max((finalCount - start) / steps, 1);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if (current >= finalCount) {
        setDisplayCount(finalCount);
        clearInterval(timer);
        try {
          sessionStorage.setItem(STORAGE_KEY, String(finalCount));
        } catch {}
      } else {
        setDisplayCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [finalCount]);

  const formatStarCount = (count: number): string => {
    return count.toLocaleString();
  };

  return (
    <a
      href={githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('starOnGithub', { count: displayCount })}
      className={`group text-muted-foreground hover:text-foreground hidden h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white/50 px-3 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-gray-300 hover:bg-white hover:shadow min-[375px]:inline-flex dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:border-neutral-700 dark:hover:bg-neutral-900 ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 group-active:scale-110"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>

      <span className="flex items-center gap-1">
        <span className="min-w-[2ch] tabular-nums">
          {formatStarCount(displayCount)}
        </span>
        <Star
          className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-[transform,color] duration-300 group-hover:rotate-12 group-hover:text-yellow-400 group-hover:drop-shadow-[0_0_6px_rgba(250,204,21,0.5)] group-active:rotate-12 group-active:text-yellow-400 group-active:drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]"
          fill="currentColor"
          aria-hidden="true"
        />
      </span>
    </a>
  );
}
