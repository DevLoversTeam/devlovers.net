'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { ChevronDown, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AchievementBadge } from '@/components/dashboard/AchievementBadge';
import type { EarnedAchievement } from '@/lib/achievements';

interface AchievementsSectionProps {
  achievements: EarnedAchievement[];
}

export function AchievementsSection({ achievements }: AchievementsSectionProps) {
  const t = useTranslations('dashboard.achievements');
  const [isExpanded, setIsExpanded] = useState(false);

  const earnedCount = achievements.filter((a) => a.earned).length;

  const cardStyles = 'dashboard-card';

  const previewBadges = achievements.slice(0, 6);
  const remainingBadges = achievements.slice(6);

  return (
    <section className={cardStyles} aria-labelledby="achievements-heading">
      <div className="flex flex-row items-center justify-between gap-3 p-4 sm:p-6 md:p-8 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="rounded-xl bg-gray-100/50 p-3 ring-1 ring-black/5 dark:bg-neutral-800/50 dark:ring-white/10 shrink-0"
            aria-hidden="true"
          >
            <Trophy className="h-5 w-5 text-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.6)]" />
          </div>
          <div className="min-w-0">
            <h3
              id="achievements-heading"
              className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight"
            >
              {t('title')}
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
              {t('subtitle', { earned: earnedCount, total: achievements.length })}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded((p) => !p)}
          aria-expanded={isExpanded}
          aria-controls="achievements-grid"
          className="shrink-0 flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/50 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 backdrop-blur-sm transition-all hover:bg-white hover:text-(--accent-primary) dark:border-white/10 dark:bg-neutral-900/50 dark:text-gray-300 dark:hover:bg-neutral-800 dark:hover:text-(--accent-primary)"
        >
          <span className="hidden sm:inline">{isExpanded ? t('ui.collapse') : t('ui.expand')}</span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pb-8">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
          {previewBadges.map((achievement) => (
            <AchievementBadge key={achievement.id} achievement={achievement} />
          ))}
        </div>

        <AnimatePresence>
          {isExpanded && remainingBadges.length > 0 && (
            <motion.div
              id="achievements-grid"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3 border-t border-gray-100 pt-6 sm:gap-4 dark:border-white/5">
                {remainingBadges.map((achievement) => (
                  <AchievementBadge key={achievement.id} achievement={achievement} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}