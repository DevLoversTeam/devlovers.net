'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { DynamicGridBackground } from '@/components/shared/DynamicGridBackground';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardTable } from './LeaderboardTable';
import { User, CurrentUser } from './types';

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
    <div className="relative min-h-screen w-full">
      <div className="fixed inset-0 z-0">
        <DynamicGridBackground className="w-full h-full bg-gray-50 transition-colors duration-300 dark:bg-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center pt-20 pb-10">
        <header className="text-center mb-16 max-w-3xl">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-[var(--accent-primary)] mb-6 drop-shadow-sm">
              {t('title')}
            </h1>
          </motion.div>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg md:text-xl text-gray-600 dark:text-gray-400 font-light leading-relaxed"
          >
            {t('subtitle')}
          </motion.p>
        </header>

        <div className="w-full flex flex-col items-center">
          <div className="w-full mb-24">
            {hasResults ? (
              <LeaderboardPodium topThree={topThree} />
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-[#111]/60 backdrop-blur-xl shadow-xl"
              >
                <p className="text-6xl mb-4 grayscale opacity-50">🏆</p>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {t('noResults')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {t('beFirst')}
                </p>
              </motion.div>
            )}
          </div>

          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            <LeaderboardTable users={allUsers} currentUser={currentUser} />
          </div>
        </div>
      </div>
    </div>
  );
}
