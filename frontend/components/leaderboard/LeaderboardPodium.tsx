'use client';

import Image from 'next/image';
import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  return (
    <ol
      className="flex items-end justify-center gap-4 md:gap-8 pb-4 pt-8 min-h-[350px] list-none m-0 p-0"
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
              'flex flex-col items-center transition-all duration-500 relative',
              isFirst ? 'order-2 z-10 -mt-8' : 'z-0',
              isSecond ? 'order-1' : '',
              isThird ? 'order-3' : ''
            )}
          >
            <div className="flex flex-col items-center">
              <div className="relative mb-4 group cursor-pointer">
                {isFirst && (
                  <Crown
                    className="absolute -top-12 left-1/2 -translate-x-1/2 w-10 h-10 text-yellow-400 animate-bounce drop-shadow-lg"
                    aria-hidden="true"
                  />
                )}
                <div
                  className={cn(
                    'relative rounded-full p-1 transition-transform duration-300 group-hover:scale-105',
                    isFirst
                      ? 'bg-gradient-to-tr from-yellow-300 via-yellow-100 to-yellow-500 shadow-yellow-500/50 shadow-lg'
                      : '',
                    isSecond
                      ? 'bg-gradient-to-tr from-slate-300 via-slate-100 to-slate-400 shadow-slate-400/50 shadow-md'
                      : '',
                    isThird
                      ? 'bg-gradient-to-tr from-orange-300 via-orange-100 to-orange-400 shadow-orange-400/50 shadow-md'
                      : ''
                  )}
                >
                  <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-800">
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
                    'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full font-bold border-2 border-white dark:border-slate-900 shadow-md',
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

              <div className="text-center mb-3">
                <div className="font-bold text-slate-800 dark:text-slate-100 text-base mb-1 truncate max-w-[120px]">
                  {user.username}
                </div>
                <div className="font-mono font-bold text-xl text-slate-900 dark:text-white tracking-tight">
                  {user.points}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    pts
                  </span>
                </div>
              </div>

              <div
                aria-hidden="true"
                className={cn(
                  'w-24 md:w-36 rounded-t-2xl border-x border-t shadow-lg backdrop-blur-sm',
                  'bg-gradient-to-b from-white/80 via-white/40 to-transparent dark:from-slate-800/80 dark:via-slate-800/40',
                  isFirst
                    ? 'h-40 border-yellow-400/30 dark:border-yellow-500/30'
                    : '',
                  isSecond
                    ? 'h-24 border-slate-300/30 dark:border-slate-500/30'
                    : '',
                  isThird
                    ? 'h-20 border-orange-300/30 dark:border-orange-500/30'
                    : ''
                )}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
