'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { OnlineCounterPopup } from '@/components/shared/OnlineCounterPopup';

import { HeroBackground } from './HeroBackground';
import { HeroCodeCards } from './HeroCodeCards';
import { InteractiveCTAButton } from './InteractiveCTAButton';

export default function HeroSection() {
  const ctaRef = React.useRef<HTMLAnchorElement>(null);
  const t = useTranslations('homepage');

  return (
    <section className="relative flex min-h-[calc(100vh-200px)] items-center overflow-hidden bg-gray-50 transition-colors duration-300 sm:min-h-[calc(100vh-280px)] md:min-h-[85vh] lg:min-h-screen dark:bg-black">
      <HeroBackground />

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center px-6 py-8 text-center sm:py-12 md:py-28 lg:py-[7.5rem] xl:py-32">
        <HeroCodeCards />

        <p className="text-foreground/90 text-[11px] font-bold tracking-[0.35em] uppercase sm:text-xs lg:text-sm">
          {t('subtitle')}
        </p>

        <div className="relative mt-6 inline-block sm:mt-8 lg:mt-14">
          <h1 className="relative inline-block px-4 text-5xl font-black tracking-tight min-[375px]:text-[3.5rem] sm:text-7xl md:text-[5rem] lg:text-8xl xl:text-[100px]">
            <span className="relative inline-block bg-gradient-to-r from-[var(--accent-primary)]/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-[var(--accent-hover)]/70 bg-clip-text text-transparent">
              DevLovers
            </span>

            <span
              className="wave-text-gradient absolute inset-0 inline-block bg-gradient-to-r from-[var(--accent-primary)] via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-[var(--accent-hover)] bg-clip-text text-transparent"
              aria-hidden="true"
            >
              DevLovers
            </span>
          </h1>
        </div>

        <p className="text-muted-foreground mt-4 text-sm font-light sm:mt-6 sm:text-sm md:mt-10 md:max-w-xl lg:mt-12 lg:max-w-2xl lg:text-base">
          {t('description')}
        </p>

        <div className="mt-6 sm:mt-8 md:mt-14 lg:mt-16">
          <InteractiveCTAButton ref={ctaRef} />
          <OnlineCounterPopup ctaRef={ctaRef} />
        </div>
      </div>
    </section>
  );
}
