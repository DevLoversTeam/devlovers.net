'use client';

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User } from './types';

export function LeaderboardPodium({ topThree }: { topThree: User[] }) {
  const order = [topThree[1], topThree[0], topThree[2]];

  return (
    <div className="flex items-end justify-center gap-4 md:gap-8 pb-12 pt-8 min-h-[350px]">
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
                  className="absolute -top-10 left-1/2 -translate-x-1/2 w-8 h-8 text-yellow-500 fill-yellow-500 animate-bounce"
                  strokeWidth={1.5}
                />
              )}

              <div
                className={cn(
                  'relative flex items-center justify-center rounded-full overflow-hidden bg-white shadow-xl transition-transform duration-300 group-hover:scale-105',
                  isFirst ? 'w-28 h-28 ring-4 ring-yellow-400' : '',
                  isSecond ? 'w-20 h-20 ring-4 ring-slate-300' : '',
                  isThird ? 'w-20 h-20 ring-4 ring-orange-300' : ''
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
                  <span className="text-2xl font-bold text-slate-700">
                    {user.username.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border-4 border-white shadow-md',
                  isFirst ? 'bg-yellow-500 text-white' : '',
                  isSecond ? 'bg-slate-400 text-white' : '',
                  isThird ? 'bg-orange-400 text-white' : ''
                )}
              >
                {user.rank}
              </div>
            </div>

            <div className="text-center mb-3">
              <div className="font-bold text-slate-800 text-base mb-1 truncate max-w-[120px]">
                {user.username}
              </div>
              <div className="font-mono font-bold text-xl text-slate-900 tracking-tight">
                {user.points}
              </div>
            </div>

            <div
              className={cn(
                'w-24 md:w-32 rounded-t-lg border-x border-t bg-gradient-to-b from-white to-slate-50 shadow-sm',
                isFirst ? 'h-40 border-yellow-400/30 from-yellow-50/50' : '',
                isSecond ? 'h-24 border-slate-300/30 from-slate-50/50' : '',
                isThird ? 'h-16 border-orange-300/30 from-orange-50/50' : ''
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
