'use client';
import { motion } from 'framer-motion';
import { ArrowRight,Check, Heart, Server, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { GradientBadge } from '@/components/ui/gradient-badge';
import { ParticleCanvas } from '@/components/ui/particle-canvas';
import { SectionHeading } from '@/components/ui/section-heading';
import type { Sponsor } from '@/lib/about/github-sponsors';

import { SponsorsWall } from './SponsorsWall';

interface PricingSectionProps {
  sponsors?: Sponsor[];
}

export function PricingSection({ sponsors = [] }: PricingSectionProps) {
  const t = useTranslations('about.pricing');
  const [activeShape, setActiveShape] = useState<'brackets' | 'heart' | null>(
    null
  );

  const juniorFeatures = [
    t('junior.features.unlimited'),
    t('junior.features.fullAccess'),
    t('junior.features.noCard'),
    t('junior.features.noGuilt'),
  ];

  const heroFeatures = [
    t('hero.features.servers'),
    t('hero.features.coffee'),
    t('hero.features.badge'),
    t('hero.features.feeling'),
  ];

  return (
    <section
      className="relative w-full overflow-hidden bg-gray-50 py-20 lg:py-28 dark:bg-transparent"
      aria-labelledby="pricing-heading"
    >
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1e5eff]/5 blur-[100px] dark:bg-[#ff2d55]/5"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 z-0">
        <ParticleCanvas activeShape={activeShape} className="h-full w-full" />
      </div>

      <div className="container-main relative z-10">
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <h2 id="pricing-heading" className="sr-only">
              {t('heading')}
            </h2>
            <GradientBadge icon={Sparkles} text={t('badge')} className="mb-4" />
          </motion.div>

          <SectionHeading
            title={t('title')}
            highlight={t('titleHighlight')}
            subtitle={t('subtitle')}
          />
        </div>

        <div className="mx-auto mb-6 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 lg:gap-12">
          <motion.div
            whileHover={{ y: -5 }}
            onMouseEnter={() => setActiveShape('brackets')}
            onMouseLeave={() => setActiveShape(null)}
            onFocus={() => setActiveShape('brackets')}
            onBlur={() => setActiveShape(null)}
            className="relative z-10 flex flex-col rounded-3xl border border-gray-200 bg-white/10 p-8 shadow-sm backdrop-blur-md lg:p-10 dark:border-neutral-800 dark:bg-neutral-900/10"
          >
            <div className="mb-6">
              <h3 className="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                {t('junior.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                {t('junior.description')}
              </p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-black text-gray-900 lg:text-5xl dark:text-white">
                {t('junior.price')}
              </span>
              <span className="ml-2 font-mono text-sm text-gray-500 dark:text-neutral-500">
                {t('junior.period')}
              </span>
            </div>

            <ul className="mb-8 flex-1 space-y-4">
              {juniorFeatures.map(item => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm text-gray-700 dark:text-neutral-300"
                >
                  <div
                    className="rounded-full bg-green-500/10 p-1 text-green-500"
                    aria-hidden="true"
                  >
                    <Check size={12} />
                  </div>
                  {item}
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-gray-400 line-through decoration-gray-300 dark:text-neutral-500 dark:decoration-neutral-700">
                <div
                  className="rounded-full bg-gray-100 p-1 text-gray-400 dark:bg-neutral-800 dark:text-neutral-600"
                  aria-hidden="true"
                >
                  <X size={12} />
                </div>
                {t('junior.noYacht')}
              </li>
            </ul>

            <Link
              href="/"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-4 text-center text-xs font-bold tracking-widest text-gray-900 uppercase transition-all hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {t('junior.cta')}
            </Link>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            onMouseEnter={() => setActiveShape('heart')}
            onMouseLeave={() => setActiveShape(null)}
            onFocus={() => setActiveShape('heart')}
            onBlur={() => setActiveShape(null)}
            className="relative z-10 flex flex-col overflow-hidden rounded-3xl border border-[#1e5eff]/30 bg-gradient-to-b from-[#1e5eff]/5 to-white/10 p-8 backdrop-blur-md lg:p-10 dark:border-[#ff2d55]/30 dark:from-[#ff2d55]/10 dark:to-neutral-900/10"
          >
            <div className="absolute top-0 right-0 rounded-bl-xl bg-[#1e5eff] px-3 py-1 text-[10px] font-bold tracking-widest text-white uppercase dark:bg-[#ff2d55]">
              {t('hero.badge')}
            </div>

            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
                {t('hero.title')}
                <Heart
                  size={18}
                  className="fill-[#1e5eff] text-[#1e5eff] dark:fill-[#ff2d55] dark:text-[#ff2d55]"
                  aria-label="Supporter"
                />
              </h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t('hero.description')}
              </p>
            </div>
            <div className="mb-8">
              <span className="text-4xl font-black text-[#1e5eff] lg:text-5xl dark:text-[#ff2d55]">
                {t('hero.price')}
              </span>
              <span className="ml-2 font-mono text-sm text-neutral-500">
                {t('hero.period')}
              </span>
            </div>

            <ul className="mb-8 flex-1 space-y-4">
              {heroFeatures.map(item => (
                <li
                  key={item}
                  className="flex items-center gap-3 text-sm font-medium text-gray-900 dark:text-white"
                >
                  <div
                    className="rounded-full bg-[#1e5eff]/20 p-1 text-[#1e5eff] dark:bg-[#ff2d55]/20 dark:text-[#ff2d55]"
                    aria-hidden="true"
                  >
                    <Sparkles size={12} />
                  </div>
                  {item}
                </li>
              ))}
              <li className="flex items-center gap-3 text-sm text-gray-600 italic dark:text-neutral-400">
                <div
                  className="rounded-full bg-gray-200 p-1 text-gray-500 dark:bg-neutral-800 dark:text-neutral-500"
                  aria-hidden="true"
                >
                  <Server size={12} />
                </div>
                {t('hero.drizzle')}
              </li>
            </ul>

            <Link
              href="https://github.com/sponsors/DevLoversTeam"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e5eff] py-4 text-xs font-bold tracking-widest text-white uppercase shadow-[0_0_20px_rgba(30,94,255,0.3)] transition-all hover:bg-[#1e5eff]/90 hover:shadow-[0_0_30px_rgba(30,94,255,0.5)] dark:bg-[#ff2d55] dark:shadow-[0_0_20px_rgba(255,45,85,0.3)] dark:hover:bg-[#ff2d55]/90 dark:hover:shadow-[0_0_30px_rgba(255,45,85,0.5)]"
            >
              {t('hero.cta')}{' '}
              <ArrowRight
                size={14}
                className="transition-transform group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
          </motion.div>
        </div>

        <p className="mx-auto mb-16 max-w-lg text-center font-mono text-[10px] leading-relaxed text-gray-400 dark:text-neutral-600">
          {t('disclaimer')}
        </p>

        <SponsorsWall sponsors={sponsors} />
      </div>
    </section>
  );
}
