'use client';

import { Star } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface GitHubStarButtonProps {
  org: string;
  className?: string;
}

export function GitHubStarButton({ className = '' }: GitHubStarButtonProps) {
  const [displayCount, setDisplayCount] = useState(0);
  const [finalCount, setFinalCount] = useState<number | null>(null);
  const githubUrl = 'https://github.com/DevLoversTeam/devlovers.net';
  const hasAnimated = useRef(false);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          const starsStr = data.githubStars;
          let starsNum = 0;

          if (starsStr.includes('k+')) {
            starsNum = Math.floor(
              parseFloat(starsStr.replace('k+', '')) * 1000
            );
          } else {
            starsNum = parseInt(starsStr);
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
    if (finalCount === null || hasAnimated.current) return;

    hasAnimated.current = true;
    const duration = 2000;
    const steps = 60;
    const increment = finalCount / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= finalCount) {
        setDisplayCount(finalCount);
        clearInterval(timer);
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
      aria-label={`Star on GitHub - ${displayCount} stars`}
      className={`
        hidden lg:inline-flex
        group relative
        items-center
        px-3 py-2
        text-sm font-medium
        rounded-lg
        overflow-hidden
        bg-foreground text-background
        dark:bg-foreground dark:text-background
        border border-border
        hover:opacity-90
        transition-all duration-200
        shadow-sm
        ${className}
      `}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>

      <span className="flex items-center gap-0.5 ml-2">
        <span className="font-semibold tabular-nums min-w-[2ch] text-right">
          {formatStarCount(displayCount)}
        </span>
        <Star
          className="
            h-4 w-4 flex-shrink-0 
            transition-all duration-300 
            group-hover:rotate-12
            group-hover:text-yellow-400
            group-hover:drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]
          "
          fill="currentColor"
          aria-hidden="true"
        />
      </span>
    </a>
  );
}
