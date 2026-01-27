'use client';

import { useTranslations } from 'next-intl';
import { HeroBackground } from './HeroBackground';
import { HeroCodeCards } from './HeroCodeCards';
import { InteractiveCTAButton } from './InteractiveCTAButton';

export default function HeroSection() {
  const t = useTranslations('homepage');

  return (
    <section
      className="
        relative
        overflow-hidden
        min-h-[calc(100vh-260px)]
sm:min-h-[calc(100vh-280px)] md:min-h-[85vh] lg:min-h-[100vh]
        flex
        items-center
        bg-gray-50 dark:bg-black
        transition-colors duration-300
      "
    >
      <HeroBackground />

      <div className="relative max-w-5xl mx-auto w-full px-6 py-8 sm:py-12 md:py-28 lg:py-30 xl:py-32 flex flex-col items-center text-center">
        <HeroCodeCards />

        <p className="text-[11px] sm:text-xs md:text-sm tracking-[0.35em] uppercase text-foreground font-bold">
          {t('subtitle')}
        </p>

        <div className="mt-6 sm:mt-8 md:mt-14 lg:mt-16 relative inline-block">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight relative inline-block">
            <span className="relative inline-block bg-gradient-to-r from-[var(--accent-primary)]/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-[var(--accent-hover)]/70 bg-clip-text text-transparent">
              DevLovers
            </span>

            <span
              className="absolute inset-0 inline-block bg-gradient-to-r from-[var(--accent-primary)] via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-[var(--accent-hover)] bg-clip-text text-transparent wave-text-gradient"
              aria-hidden="true"
            >
              DevLovers
            </span>
          </h1>
        </div>

        <p className="mt-4 sm:mt-6 md:mt-10 lg:mt-12 max-w-2xl text-sm sm:text-base md:text-lg text-muted-foreground font-light">
          {t('description')}
        </p>

        <div className="mt-6 sm:mt-8 md:mt-14 lg:mt-16">
          <InteractiveCTAButton />
        </div>
      </div>
    </section>
  );
}
