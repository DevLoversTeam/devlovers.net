'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';

import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';

import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardTable } from './LeaderboardTable';
import { CurrentUser, User } from './types';

interface LeaderboardClientProps {
  initialUsers: User[];
  currentUser?: CurrentUser | null;
}

export default function LeaderboardClient({
  initialUsers,
  currentUser,
}: LeaderboardClientProps) {
  const t = useTranslations('leaderboard');

  const allUsers = initialUsers;
  const topThree = allUsers.filter(u => u.points > 0).slice(0, 3);
  const hasResults = topThree.length > 0;

  return (
    <DynamicGridBackground className="min-h-screen bg-gray-50 transition-colors duration-300 dark:bg-transparent">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 pt-20 pb-10 sm:px-6 lg:px-8">
        <header className="mb-16 max-w-3xl text-center">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="relative mb-6 inline-block pb-2 text-4xl font-black tracking-tight md:text-6xl lg:text-7xl">
              <span className="relative inline-block bg-gradient-to-r from-[var(--accent-primary)]/70 via-[color-mix(in_srgb,var(--accent-primary)_70%,white)]/70 to-[var(--accent-hover)]/70 bg-clip-text text-transparent">
                {t('title')}
              </span>
              <span
                className="wave-text-gradient pointer-events-none absolute inset-0 inline-block bg-gradient-to-r from-[var(--accent-primary)] via-[color-mix(in_srgb,var(--accent-primary)_70%,white)] to-[var(--accent-hover)] bg-clip-text text-transparent"
                aria-hidden="true"
              >
                {t('title')}
              </span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg leading-relaxed font-light text-gray-600 md:text-xl dark:text-gray-400"
          >
            {t('subtitle')}
          </motion.p>
        </header>

        <div className="flex w-full flex-col items-center">
          <div className="mb-24 w-full">
            {hasResults ? (
              <LeaderboardPodium topThree={topThree} />
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-gray-200 bg-white/60 py-20 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#111]/60"
              >
                <p className="mb-4 text-6xl opacity-50 grayscale">🏆</p>
                <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">
                  {t('noResults')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {t('beFirst')}
                </p>
              </motion.div>
            )}
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-8 w-full delay-200 duration-700">
            <LeaderboardTable users={allUsers} currentUser={currentUser} />
          </div>
        </div>
      </div>
    </DynamicGridBackground>
  );
}
