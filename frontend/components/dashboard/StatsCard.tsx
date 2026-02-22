'use client';

import { motion } from 'framer-motion';
import { History, Target,TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';

interface StatsCardProps {
  stats?: {
    totalAttempts: number;
    averageScore: number;
    lastActiveDate: string | null;
    totalScore?: number;
    trendPercentage?: number | null;
  };
  attempts?: {
    percentage: string | number;
    score: number;
    completedAt: Date;
  }[];
}

export function StatsCard({ stats, attempts = [] }: StatsCardProps) {
  const t = useTranslations('dashboard.stats');
  const tProfile = useTranslations('dashboard.profile');
  const hasActivity = stats && stats.totalAttempts > 0;

  const cardStyles = `
    relative z-10 flex flex-col justify-between overflow-hidden rounded-3xl
    border border-gray-200 bg-white/10 shadow-sm backdrop-blur-md
    dark:border-neutral-800 dark:bg-neutral-900/10
    p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-md
    hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30
  `;

  const primaryBtnStyles = `
    group relative inline-flex items-center justify-center rounded-full
    px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white
    bg-(--accent-primary) hover:bg-(--accent-hover)
    transition-all hover:scale-105
  `;

  // Calculate chart metrics
  const excellent = attempts.filter(a => Number(a.percentage) >= 100).length;
  const good = attempts.filter(a => Number(a.percentage) >= 70 && Number(a.percentage) < 100).length;
  const needsReview = attempts.filter(a => Number(a.percentage) < 70).length;
  const total = attempts.length || 1;

  const excellentPct = (excellent / total) * 100;
  const goodPct = (good / total) * 100;
  const needsReviewPct = (needsReview / total) * 100;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const halfCircumference = Math.PI * radius;
  
  const masteredLength = (excellentPct / 100) * halfCircumference;
  const reviewLength = ((excellentPct + goodPct) / 100) * halfCircumference;
  const studyLength = ((excellentPct + goodPct + needsReviewPct) / 100) * halfCircumference;

  return (
    <section className={cardStyles} aria-labelledby="stats-heading">
      <div className="mb-6 flex items-center gap-3 w-full">
        <div
          className="rounded-xl bg-gray-100/50 p-3 ring-1 ring-black/5 dark:bg-neutral-800/50 dark:ring-white/10"
          aria-hidden="true"
        >
          <Target className="h-5 w-5 text-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.6)]" />
        </div>
        <div>
          <h3
            id="stats-heading"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            {t('scoreDistribution')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('scoreDistributionSubtext', { fallback: 'Based on your recent attempts' })}
          </p>
        </div>
      </div>

      {!hasActivity ? (
        <>
          <p className="mx-auto mb-8 max-w-xs text-gray-500 dark:text-gray-400">
            {t('noActivity')}
          </p>
          <Link href="/quizzes" className={primaryBtnStyles}>
            <span className="relative z-10">{t('startQuiz')}</span>
          </Link>
        </>
      ) : (
        <>
          <div className="flex w-full flex-col md:flex-row items-center md:items-start gap-6 pt-2">
            <div className="relative flex w-[220px] md:w-[260px] aspect-[2/1] shrink-0 items-end justify-center mx-auto md:mx-0">
              <svg className="absolute inset-x-0 bottom-0 h-full w-full overflow-visible drop-shadow-[0_4px_10px_rgba(0,0,0,0.05)] dark:drop-shadow-[0_4px_10px_rgba(0,0,0,0.2)]" viewBox="0 0 100 55">
                <defs>
                  <linearGradient id="neonGradientMastered" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="neonGradientReview" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                  <linearGradient id="neonGradientStudy" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F87171" />
                    <stop offset="100%" stopColor="#DC2626" />
                  </linearGradient>
                  <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                <motion.circle
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{ strokeDasharray: `${halfCircumference} ${circumference}` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  className="stroke-gray-100 dark:stroke-neutral-800"
                  strokeWidth="14"
                  strokeLinecap="round"
                  transform="rotate(180 50 50)"
                />
                
                {/* 1. Study Overlay (Red - Bottom Layer) */}
                <motion.circle
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{ strokeDasharray: `${studyLength} ${circumference}` }}
                  transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="url(#neonGradientStudy)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  transform="rotate(180 50 50)"
                  filter="url(#neonGlow)"
                />

                {/* 2. Review Overlay (Amber - Middle Layer) */}
                <motion.circle
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{ strokeDasharray: `${reviewLength} ${circumference}` }}
                  transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="url(#neonGradientReview)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  transform="rotate(180 50 50)"
                  filter="url(#neonGlow)"
                />

                {/* 3. Mastered Overlay (Emerald - Top Layer) */}
                <motion.circle
                  initial={{ strokeDasharray: `0 ${circumference}` }}
                  animate={{ strokeDasharray: `${masteredLength} ${circumference}` }}
                  transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="transparent"
                  stroke="url(#neonGradientMastered)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  transform="rotate(180 50 50)"
                  filter="url(#neonGlow)"
                />
              </svg>
              <div className="relative z-10 flex flex-col items-center pointer-events-none mb-1">
                <span className="text-3xl sm:text-4xl font-black tracking-tighter leading-none text-gray-900 dark:text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                  {stats?.averageScore}%
                </span>
                <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase mt-0.5">
                  Score
                </span>
              </div>
            </div>

            {/* Legend & Stats */}
            <div className="flex flex-1 flex-col justify-center gap-3 w-full">
              <div className="flex items-center justify-between text-sm w-full">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded-full bg-linear-to-br from-emerald-400 to-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                  <span className="flex-1 truncate text-gray-600 dark:text-gray-300">
                    {t('mastered')} <span className="font-mono text-xs text-gray-400 dark:text-gray-500 ml-1">({total > 0 ? excellentPct.toFixed(0) : 0}%)</span>
                  </span>
                </div>
                <span className="font-bold tabular-nums text-gray-900 dark:text-white">{excellent}</span>
              </div>
              <div className="flex items-center justify-between text-sm w-full">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded-full bg-linear-to-br from-amber-400 to-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                  <span className="flex-1 truncate text-gray-600 dark:text-gray-300">
                    {t('review')} <span className="font-mono text-xs text-gray-400 dark:text-gray-500 ml-1">({total > 0 ? goodPct.toFixed(0) : 0}%)</span>
                  </span>
                </div>
                <span className="font-bold tabular-nums text-gray-900 dark:text-white">{good}</span>
              </div>
              <div className="flex items-center justify-between text-sm w-full">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded-full bg-linear-to-br from-red-400 to-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                  <span className="flex-1 truncate text-gray-600 dark:text-gray-300">
                    {t('study')} <span className="font-mono text-xs text-gray-400 dark:text-gray-500 ml-1">({total > 0 ? needsReviewPct.toFixed(0) : 0}%)</span>
                  </span>
                </div>
                <span className="font-bold tabular-nums text-gray-900 dark:text-white">{needsReview}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3 text-sm dark:border-white/5">
                <span className="font-semibold text-gray-500">{t('totalAttempts')}</span>
                <span className="font-black text-(--accent-primary)">{stats?.totalAttempts}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-500">{tProfile('totalPoints')}</span>
                <span className="font-black text-amber-500">{stats?.totalScore ?? 0}</span>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
