'use client';

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const order = [topThree[1], topThree[0], topThree[2]];

  return (
    <div className="flex items-end justify-center gap-4 md:gap-8 pb-4 pt-8 min-h-[350px]">
      {order.map((user, idx) => {
        if (!user) return null;
        const isFirst = user.rank === 1;
        const isSecond = user.rank === 2;
        const isThird = user.rank === 3;

        return (
          <div
            key={user.id}
            className={cn(
              'flex flex-col items-center transition-all duration-500',
              isFirst ? 'order-2 z-10 -mt-8' : 'z-0',
              isSecond ? 'order-1' : '',
              isThird ? 'order-3' : ''
            )}
          >
            <div className="relative mb-4 group cursor-pointer">
              {isFirst && (
                <Crown
                  className="absolute -top-12 left-1/2 -translate-x-1/2 w-10 h-10 text-yellow-500 fill-yellow-500 animate-bounce drop-shadow-lg"
                  strokeWidth={1.5}
                />
              )}

              <div
                className={cn(
                  'relative flex items-center justify-center rounded-full overflow-hidden shadow-2xl transition-transform duration-300 group-hover:scale-105 border-4',
                  isFirst
                    ? 'w-28 h-28 border-yellow-400 dark:border-yellow-500'
                    : '',
                  isSecond
                    ? 'w-20 h-20 border-slate-300 dark:border-slate-500'
                    : '',
                  isThird
                    ? 'w-20 h-20 border-orange-300 dark:border-orange-400'
                    : '',
                  'bg-white dark:bg-slate-800'
                )}
              >
                {user.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-slate-700 dark:text-slate-200">
                    {user.username.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border-2 border-white dark:border-slate-900 shadow-md',
                  isFirst ? 'bg-yellow-500 text-white' : '',
                  isSecond ? 'bg-slate-400 text-white' : '',
                  isThird ? 'bg-orange-400 text-white' : ''
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
                {user.points}
              </div>
            </div>

            <div
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
                  ? 'h-16 border-orange-300/30 dark:border-orange-500/30'
                  : ''
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
