'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type HomePageScrollProps = {
  children: ReactNode;
};

export default function HomePageScroll({ children }: HomePageScrollProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSnapMode = () => {
      const steps = container.querySelectorAll<HTMLElement>('[data-home-step]');
      const secondStep = steps[1];
      if (!secondStep) return;

      const shouldEnableSnap = container.scrollTop <= secondStep.offsetTop + 4;
      setSnapEnabled(prev =>
        prev === shouldEnableSnap ? prev : shouldEnableSnap
      );
    };

    updateSnapMode();
    container.addEventListener('scroll', updateSnapMode, { passive: true });
    window.addEventListener('resize', updateSnapMode);

    return () => {
      container.removeEventListener('scroll', updateSnapMode);
      window.removeEventListener('resize', updateSnapMode);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-[calc(100dvh-4rem)] overflow-y-auto overscroll-y-none',
        snapEnabled ? 'snap-y snap-mandatory' : 'snap-none'
      )}
    >
      {children}
    </div>
  );
}
