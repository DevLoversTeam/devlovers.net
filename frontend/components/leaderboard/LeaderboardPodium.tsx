'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const podiumOrder = [
    topThree.find(u => u.rank === 2),
    topThree.find(u => u.rank === 1),
    topThree.find(u => u.rank === 3),
  ].filter(Boolean) as User[];

  return (
    <div className="flex items-end justify-center gap-4 md:gap-8 h-[350px] w-full max-w-3xl mx-auto">
      {podiumOrder.map(user => {
        const rank = user.rank;
        const isFirst = rank === 1;

        const height = rank === 1 ? '100%' : rank === 2 ? '40%' : '35%';
        const delay = rank === 1 ? 0.4 : rank === 2 ? 0.2 : 0.6;

        const rankStyles = {
          1: {
            border: 'border-yellow-400 dark:border-yellow-500',
            bg: 'bg-yellow-400/20 dark:bg-yellow-500/10',
            text: 'text-yellow-600 dark:text-yellow-400',
            badge: 'bg-yellow-400 dark:bg-yellow-500',
            ring: 'border-yellow-400 dark:border-yellow-500',
            barTop: 'bg-yellow-400 dark:bg-yellow-500',
          },
          2: {
            border: 'border-slate-300 dark:border-slate-500',
            bg: 'bg-slate-300/20 dark:bg-slate-500/10',
            text: 'text-slate-600 dark:text-slate-400',
            badge: 'bg-slate-400 dark:bg-slate-500',
            ring: 'border-slate-300 dark:border-slate-500',
            barTop: 'bg-slate-300 dark:bg-slate-500',
          },
          3: {
            border: 'border-orange-300 dark:border-orange-500',
            bg: 'bg-orange-300/20 dark:bg-orange-500/10',
            text: 'text-orange-600 dark:text-orange-400',
            badge: 'bg-orange-400 dark:bg-orange-500',
            ring: 'border-orange-300 dark:border-orange-500',
            barTop: 'bg-orange-300 dark:bg-orange-500',
          },
        };

        const style = rankStyles[rank as 1 | 2 | 3] || rankStyles[2];

        return (
          <div
            key={user.id}
            className="relative flex flex-col items-center justify-end w-1/3 h-full"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.5, duration: 0.5 }}
              className="mb-3 md:mb-4 flex flex-col items-center text-center z-10"
            >
              <div className="relative mb-2">
                {isFirst && (
                  <Crown
                    className="absolute -top-6 md:-top-8 left-1/2 -translate-x-1/2 w-5 h-5 md:w-6 md:h-6 text-yellow-500 animate-bounce"
                    fill="currentColor"
                  />
                )}

                <div
                  className={cn(
                    'relative w-14 h-14 md:w-20 md:h-20 rounded-full p-1 transition-colors duration-300 border-2',
                    style.ring
                  )}
                >
                  <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-100 dark:bg-black">
                    <Image
                      src={user.avatar}
                      alt={user.username}
                      fill
                      className="object-cover"
                    />
                  </div>

                  <div
                    className={cn(
                      'absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold text-white shadow-sm transition-colors duration-300',
                      style.badge
                    )}
                  >
                    {user.rank}
                  </div>
                </div>
              </div>

              <div className="font-bold text-gray-900 dark:text-white text-xs md:text-base truncate max-w-[90px] md:max-w-[140px]">
                {user.username}
              </div>

              <div
                className={cn(
                  'font-mono text-[10px] md:text-xs font-bold mt-0.5',
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
                'w-full rounded-t-xl md:rounded-t-2xl relative overflow-hidden backdrop-blur-md border-x border-t transition-colors duration-300',
                style.bg,
                style.border
              )}
            >
              <div
                className={cn(
                  'w-full h-1 md:h-1.5 absolute top-0 left-0 opacity-80',
                  style.barTop
                )}
              />
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
