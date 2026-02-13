'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import * as React from 'react';
import { BrainCircuit, MessageCircleQuestion, TrendingUp } from 'lucide-react';

import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';

import { FlipCardQA } from './FlipCardQA';
import { FloatingCode } from './FloatingCode';

export default function FeaturesHeroSection() {
  const t = useTranslations('homepage');

  return (
    <DynamicGridBackground
      showStaticGrid
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gray-50 transition-colors duration-300 dark:bg-black"
    >
      <FloatingCode />

      <div className="relative z-10 flex w-full max-w-6xl flex-col items-center px-6 py-8 text-center sm:py-12">
        
        <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 sm:text-4xl md:text-5xl dark:text-white">
          {t('featuresHeading.aceYourNext')}{' '}<br className="sm:hidden" />
          <span className="bg-gradient-to-r from-[var(--accent-primary)] via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-[var(--accent-hover)] bg-clip-text text-transparent">
            {t('featuresHeading.technicalInterview')}
          </span>
        </h1>

        <p className="mb-6 max-w-xl text-xs text-gray-600 sm:text-base dark:text-gray-400">
          {t('description')}
        </p>

        <div className="mb-8 flex flex-row flex-wrap items-center justify-center gap-3 sm:gap-4">
          <div className="group relative overflow-hidden rounded-full border border-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-blue-800/30 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-100/0 via-blue-100/50 to-blue-100/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-blue-800/0 dark:via-blue-800/30 dark:to-blue-800/0" />
            <span className="relative flex items-center gap-2 text-xs font-semibold text-blue-700 sm:text-sm dark:text-blue-300">
              <MessageCircleQuestion className="h-4 w-4" />
              <span className="whitespace-nowrap">{t('featureBadges.smartQA')}</span>
            </span>
          </div>

          <div className="group relative overflow-hidden rounded-full border border-purple-200/60 bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-2 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-purple-800/30 dark:from-purple-950/30 dark:to-pink-950/30">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-100/0 via-purple-100/50 to-purple-100/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-purple-800/0 dark:via-purple-800/30 dark:to-purple-800/0" />
            <span className="relative flex items-center gap-2 text-xs font-semibold text-purple-700 sm:text-sm dark:text-purple-300">
              <BrainCircuit className="h-4 w-4" />
              <span className="whitespace-nowrap">{t('featureBadges.adaptiveQuizzes')}</span>
            </span>
          </div>

          <div className="group relative overflow-hidden rounded-full border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-emerald-800/30 dark:from-emerald-950/30 dark:to-teal-950/30">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-100/0 via-emerald-100/50 to-emerald-100/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-emerald-800/0 dark:via-emerald-800/30 dark:to-emerald-800/0" />
            <span className="relative flex items-center gap-2 text-xs font-semibold text-emerald-700 sm:text-sm dark:text-emerald-300">
              <TrendingUp className="h-4 w-4" />
              <span className="whitespace-nowrap">{t('featureBadges.performance')}</span>
            </span>
          </div>
        </div>

        <FlipCardQA />

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/q&a"
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-hover)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--accent-primary)]/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-[var(--accent-primary)]/30 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 dark:shadow-[var(--accent-primary)]/10 dark:hover:shadow-[var(--accent-primary)]/20"
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {t('featuresCta.browseQuestions')}
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </Link>

          <Link
            href="/quizzes"
            className="group relative overflow-hidden rounded-full border border-gray-300/60 bg-white/80 px-6 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition-all duration-300 hover:bg-white hover:border-gray-400 hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 dark:border-white/10 dark:bg-[#121212] dark:text-gray-200 dark:hover:bg-neutral-900 dark:hover:border-white/20 dark:shadow-none"
          >
            <span className="flex items-center justify-center gap-2">
              {t('featuresCta.takeQuiz')}
              <svg className="h-3.5 w-3.5 text-gray-400 transition-transform group-hover:rotate-12 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
          </Link>
        </div>
      </div>
    </DynamicGridBackground>
  );
}
