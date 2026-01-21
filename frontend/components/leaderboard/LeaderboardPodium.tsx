'use client';

import Image from 'next/image';
import { Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const t = useTranslations('leaderboard');

  return (
    <ol
      className="flex items-end justify-center gap-4 md:gap-8 pb-4 pt-16 min-h-[400px] list-none m-0 p-0"
      aria-label={t('topThreeLabel')}
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
              isFirst ? 'order-2 z-10 -mt-12' : '',
              isSecond ? 'order-1' : '',
              isThird ? 'order-3' : ''
            )}
          >
            <div className="flex flex-col items-center group w-full">
              <div className="relative mb-4 transition-transform duration-300 group-hover:scale-105">
                {isFirst && (
                  <Crown
                    className="absolute -top-12 left-1/2 -translate-x-1/2 w-10 h-10 text-yellow-400 animate-bounce drop-shadow-[0_0_15px_rgba(250,204,21,0.6)]"
                    aria-hidden="true"
                  />
                )}

                <div
                  className={cn(
                    'relative rounded-full p-[2px]',
                    isFirst
                      ? 'bg-gradient-to-b from-yellow-300 to-yellow-600'
                      : isSecond
                        ? 'bg-gradient-to-b from-slate-300 to-slate-500'
                        : 'bg-gradient-to-b from-orange-300 to-orange-600'
                  )}
                >
                  <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-white dark:border-slate-950 bg-slate-200 dark:bg-slate-900">
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
                    'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm border-4 border-white dark:border-slate-950 shadow-lg',
                    isFirst
                      ? 'bg-yellow-500 text-white'
                      : isSecond
                        ? 'bg-slate-400 text-slate-900'
                        : 'bg-orange-500 text-white'
                  )}
                >
                  {user.rank}
                </div>
              </div>

              <div className="text-center mb-4">
                <div className="font-bold text-slate-900 dark:text-white text-sm md:text-lg mb-1 truncate max-w-[120px]">
                  {user.username}
                </div>
                <div className="inline-block px-3 py-1 rounded-full bg-white/60 dark:bg-white/5 border border-slate-300 dark:border-white/10 backdrop-blur-sm">
                  <div className="font-mono font-bold text-xs md:text-sm text-[#ff2d55]">
                    {user.points}{' '}
                  </div>
                </div>
              </div>

              <div
                aria-hidden="true"
                className={cn(
                  'w-24 md:w-40 rounded-t-2xl backdrop-blur-md transition-all duration-300 relative overflow-hidden',
                  'border-x border-t border-slate-300 dark:border-white/10 bg-white/60 dark:bg-white/5',

                  isFirst
                    ? 'h-48 md:h-64'
                    : isSecond
                      ? 'h-32 md:h-44'
                      : 'h-24 md:h-32',

                  isFirst
                    ? 'shadow-[0_0_40px_-10px_rgba(234,179,8,0.2)] dark:shadow-[0_0_40px_-10px_rgba(234,179,8,0.3)] after:absolute after:inset-0 after:bg-gradient-to-b after:from-yellow-500/10 after:to-transparent'
                    : isSecond
                      ? 'shadow-[0_0_40px_-10px_rgba(148,163,184,0.2)] dark:shadow-[0_0_40px_-10px_rgba(148,163,184,0.2)] after:absolute after:inset-0 after:bg-gradient-to-b after:from-slate-400/10 after:to-transparent'
                      : 'shadow-[0_0_40px_-10px_rgba(249,115,22,0.2)] dark:shadow-[0_0_40px_-10px_rgba(249,115,22,0.2)] after:absolute after:inset-0 after:bg-gradient-to-b after:from-orange-500/10 after:to-transparent'
                )}
              >
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] opacity-50" />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
