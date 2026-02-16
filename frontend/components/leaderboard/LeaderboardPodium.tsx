'use client';

import { motion } from 'framer-motion';
import { Crown, Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { User } from './types';
import { UserAvatar } from './UserAvatar';

const rankConfig = {
  1: {
    height: '70%',
    delay: 0.4,
    style: {
      border: 'border-yellow-400 dark:border-yellow-500',
      bg: 'bg-yellow-400/20 dark:bg-yellow-500/10',
      text: 'text-yellow-600 dark:text-yellow-400',
      badge: 'bg-yellow-400 dark:bg-yellow-500',
      ring: 'border-yellow-400 dark:border-yellow-500',
    },
  },
  2: {
    height: '40%',
    delay: 0.2,
    style: {
      border: 'border-slate-300 dark:border-slate-500',
      bg: 'bg-slate-300/20 dark:bg-slate-500/10',
      text: 'text-slate-600 dark:text-slate-400',
      badge: 'bg-slate-400 dark:bg-slate-500',
      ring: 'border-slate-300 dark:border-slate-500',
    },
  },
  3: {
    height: '20%',
    delay: 0.6,
    style: {
      border: 'border-orange-300 dark:border-orange-500',
      bg: 'bg-orange-300/20 dark:bg-orange-500/10',
      text: 'text-orange-600 dark:text-orange-400',
      badge: 'bg-orange-400 dark:bg-orange-500',
      ring: 'border-orange-300 dark:border-orange-500',
    },
  },
} as const;

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const t = useTranslations('leaderboard');
  const podiumOrder = [
    topThree.find(u => u.rank === 2),
    topThree.find(u => u.rank === 1),
    topThree.find(u => u.rank === 3),
  ].filter(Boolean) as User[];

  return (
    <div className="mx-auto flex h-87.5 w-full max-w-3xl items-end justify-center gap-4 md:gap-8">
      {podiumOrder.map(user => {
        const rank = user.rank as 1 | 2 | 3;
        const isFirst = rank === 1;

        const config = rankConfig[rank] || rankConfig[2];
        const { height, delay, style } = config;

        return (
          <div
            key={user.id}
            className="relative flex h-full w-1/3 flex-col items-center justify-end"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.5, duration: 0.5 }}
              className="z-10 mb-3 flex flex-col items-center text-center md:mb-4"
            >
              <div className="relative mb-2">
                {isFirst && (
                  <Crown
                    className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 animate-bounce text-yellow-500 md:-top-8 md:h-6 md:w-6"
                    fill="currentColor"
                  />
                )}

                <div
                  className={cn(
                    'relative h-14 w-14 rounded-full border-2 p-1 transition-colors duration-300 md:h-20 md:w-20',
                    style.ring
                  )}
                >
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-gray-100 dark:bg-black">
                    <UserAvatar
                      src={user.avatar}
                      username={user.username}
                      userId={user.userId}
                      sizes="(min-width: 768px) 80px, 56px"
                    />
                  </div>

                  <div
                    className={cn(
                      'absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm transition-colors duration-300 md:h-6 md:w-6 md:text-xs',
                      style.badge
                    )}
                  >
                    {user.rank}
                  </div>
                </div>
              </div>

              <div className="max-w-22.5 truncate text-xs font-bold text-gray-900 md:max-w-35 md:text-base dark:text-white">
                {user.username}
              </div>

              {user.isSponsor && (
                <a
                  href="https://github.com/sponsors/DevLoversTeam"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('sponsor')}
                  className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25"
                >
                  <Heart className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  <span className="hidden md:inline">{t('sponsor')}</span>
                </a>
              )}

              <div
                className={cn(
                  'mt-0.5 font-mono text-base font-bold md:text-lg',
                  style.text
                )}
              >
                {user.points}
              </div>
            </motion.div>

            <motion.div
              initial={{ height: 0 }}
              animate={{ height: height }}
              transition={{
                duration: 0.8,
                delay: delay,
                type: 'spring',
                stiffness: 60,
                damping: 15,
              }}
              className={cn(
                'relative w-full overflow-hidden rounded-t-xl border-x border-t backdrop-blur-md transition-colors duration-300 md:rounded-t-2xl',
                style.bg,
                style.border
              )}
            ></motion.div>
          </div>
        );
      })}
    </div>
  );
}
