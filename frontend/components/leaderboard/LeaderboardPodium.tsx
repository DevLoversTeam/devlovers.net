'use client';

import Image from 'next/image';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  return (
    <ol
      className="flex items-end justify-center gap-2 md:gap-8 pb-4 pt-16 min-h-[340px] list-none m-0 p-0"
      aria-label="Top 3 Leaders"
    >
      {topThree.map(user => {
        if (!user) return null;
        const isFirst = user.rank === 1;
        const isSecond = user.rank === 2;
        const isThird = user.rank === 3;

        return (
          <li
            key={user.id}
            className={cn(
              'flex flex-col items-center transition-all duration-500 relative z-0',
              isFirst ? 'order-2 z-10 -mt-8 md:-mt-12' : '',
              isSecond ? 'order-1' : '',
              isThird ? 'order-3' : ''
            )}
          >
            <div className="flex flex-col items-center group">
              <div className="relative mb-3 md:mb-5 transition-transform duration-300 group-hover:scale-105">
                {isFirst && (
                  <Crown
                    className="absolute -top-10 md:-top-12 left-1/2 -translate-x-1/2 w-10 h-10 md:w-12 md:h-12 text-yellow-400 animate-bounce drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]"
                    aria-hidden="true"
                  />
                )}

                <div
                  className={cn(
                    'relative rounded-full p-[3px] shadow-2xl',
                    isFirst
                      ? 'bg-gradient-to-tr from-yellow-300 via-yellow-100 to-yellow-500'
                      : isSecond
                        ? 'bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400'
                        : 'bg-gradient-to-tr from-orange-300 via-orange-100 to-orange-400'
                  )}
                >
                  <div className="relative w-16 h-16 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-white dark:border-slate-900 bg-slate-200">
                    <Image
                      src={user.avatar}
                      alt={`${user.username}'s avatar`}
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>

                <div
                  className={cn(
                    'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-7 h-7 md:w-9 md:h-9 rounded-full font-bold text-xs md:text-sm border-[3px] border-white dark:border-slate-900 shadow-lg',
                    isFirst
                      ? 'bg-yellow-500 text-white'
                      : isSecond
                        ? 'bg-slate-400 text-white'
                        : 'bg-orange-400 text-white'
                  )}
                >
                  {user.rank}
                </div>
              </div>

              <div className="text-center mb-3 md:mb-5">
                <div className="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-lg mb-1 truncate max-w-[85px] md:max-w-[140px]">
                  {user.username}
                </div>
                <div className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="font-mono font-bold text-xs md:text-sm text-slate-700 dark:text-slate-300">
                    {user.points} <span className="text-slate-400">pts</span>
                  </div>
                </div>
              </div>

              <div
                aria-hidden="true"
                className={cn(
                  'w-20 md:w-40 rounded-t-2xl backdrop-blur-xl transition-all duration-300',
                  'border-t-2 border-x-2 border-white/60 dark:border-white/10',

                  isFirst
                    ? 'h-40 md:h-56 bg-gradient-to-b from-yellow-200/30 to-yellow-500/5 dark:from-yellow-400/20 dark:to-transparent shadow-[0_0_50px_-10px_rgba(234,179,8,0.4)]'
                    : isSecond
                      ? 'h-28 md:h-40 bg-gradient-to-b from-slate-200/30 to-slate-500/5 dark:from-slate-400/20 dark:to-transparent shadow-[0_0_40px_-10px_rgba(148,163,184,0.3)]'
                      : 'h-20 md:h-28 bg-gradient-to-b from-orange-200/30 to-orange-500/5 dark:from-orange-400/20 dark:to-transparent shadow-[0_0_40px_-10px_rgba(251,146,60,0.3)]'
                )}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
