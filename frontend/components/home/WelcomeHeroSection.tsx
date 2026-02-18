'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

import { InteractiveConstellation } from '@/components/home/InteractiveConstellation';
import { InteractiveCTAButton } from '@/components/home/InteractiveCTAButton';
import { WelcomeHeroBackground } from '@/components/home/WelcomeHeroBackground';
import { OnlineCounterPopup } from '@/components/shared/OnlineCounterPopup';

export default function WelcomeHeroSection() {
  const t = useTranslations('homepage');
  const ctaRef = React.useRef<HTMLAnchorElement>(null);

  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center overflow-hidden px-4 md:px-8 lg:px-12">
      <WelcomeHeroBackground />
      <InteractiveConstellation />
      <div className="z-10 flex w-full max-w-5xl flex-col items-center text-center">
        <span className="mb-6 text-[10px] font-bold tracking-[0.25em] text-gray-600 uppercase sm:text-xs md:text-sm dark:text-white/70">
          {t('subtitle')}
        </span>
        <div className="relative">
          <h1 className="select-none text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
            <span className="relative inline-block bg-linear-to-r from-(--accent-primary)/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-(--accent-hover)/70 bg-clip-text text-transparent">
              DevLovers
            </span>

            <span
              className="wave-text-gradient absolute inset-0 inline-block bg-linear-to-r from-(--accent-primary) via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-(--accent-hover) bg-clip-text text-transparent"
              aria-hidden="true"
            >
              DevLovers
            </span>
          </h1>
        </div>

        <p className="text-muted-foreground mt-4 text-sm font-light sm:mt-6 sm:text-sm md:mt-10 md:max-w-xl lg:mt-12 lg:max-w-2xl lg:text-base">
          {t('welcomeDescription')}
        </p>

        <div className="mt-6 sm:mt-8 md:mt-14 lg:mt-16">
          <InteractiveCTAButton ref={ctaRef} />
        </div>
      </div>

      <OnlineCounterPopup ctaRef={ctaRef} />

      <motion.button
        type="button"
        onClick={() => {
          const steps = document.querySelectorAll<HTMLElement>('[data-home-step]');
          if (steps[1]) steps[1].scrollIntoView({ behavior: 'smooth' });
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex cursor-pointer flex-col items-center gap-2 text-gray-400 transition-colors hover:text-(--accent-primary) dark:text-white/50 dark:hover:text-(--accent-primary)"
        aria-label="Scroll to next section"
      >
        <div className="relative h-8 w-5 rounded-full border-2 border-current p-1 opacity-75">
           <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto h-1.5 w-1 rounded-full bg-current"
           />
        </div>
        <motion.div
           animate={{ y: [0, 4, 0] }}
           transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        >
            <ChevronDown className="h-4 w-4" />
        </motion.div>
      </motion.button>
    </section>
  );
}
