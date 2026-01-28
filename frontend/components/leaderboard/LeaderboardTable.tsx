'use client';

import { TrendingUp, Trophy, Medal } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { User, CurrentUser } from './types';

interface LeaderboardTableProps {
  users: User[];
  currentUser?: CurrentUser | null;
}

export function LeaderboardTable({
  users,
  currentUser,
}: LeaderboardTableProps) {
  const t = useTranslations('leaderboard');

  const topUsers = users.slice(0, 10);
  const normalizedCurrentUserId = currentUser ? String(currentUser.id) : null;
  const currentUsername = currentUser?.username;

  const matchedUser = users.find(
    u =>
      String(u.id) === normalizedCurrentUserId ||
      (currentUsername && u.username === currentUsername)
  );

  const currentUserRank = matchedUser?.rank || 0;
  const isUserInTop = currentUserRank > 0 && currentUserRank <= 10;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-lg dark:shadow-2xl">
        <div className="w-full">
          <table className="w-full text-left border-separate border-spacing-0 table-fixed">
            <caption className="sr-only">{t('tableCaption')}</caption>

            <thead className="bg-slate-50/80 dark:bg-white/5">
              <tr>
                <th className="px-2 sm:px-6 py-3 sm:py-5 text-center text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest w-[15%] sm:w-[12%] border-b border-slate-200 dark:border-white/10">
                  {t('rank')}
                </th>
                <th className="px-2 sm:px-6 py-3 sm:py-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest w-auto border-b border-slate-200 dark:border-white/10">
                  {t('user')}
                </th>
                <th className="pl-2 pr-4 sm:px-6 py-3 sm:py-5 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest w-[25%] sm:w-[20%] border-b border-slate-200 dark:border-white/10">
                  {t('score')}
                </th>
              </tr>
            </thead>

            <tbody>
              {topUsers.map(user => {
                const isMe =
                  String(user.id) === normalizedCurrentUserId ||
                  (currentUsername && user.username === currentUsername);

                return (
                  <TableRow
                    key={user.id}
                    user={user}
                    isCurrentUser={!!isMe}
                    t={t}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!isUserInTop && matchedUser && (
        <>
          <div className="text-center text-slate-400 dark:text-slate-600 text-xl font-bold tracking-widest select-none py-2">
            • • •
          </div>

          <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl border-2 border-[var(--accent-primary)] overflow-hidden shadow-[0_0_20px_var(--accent-primary)]">
            <div className="w-full">
              <table className="w-full text-left border-separate border-spacing-0 table-fixed">
                <tbody>
                  <TableRow user={matchedUser} isCurrentUser={true} t={t} />
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TableRow({
  user,
  isCurrentUser,
  t,
}: {
  user: User;
  isCurrentUser: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const cellClass =
    'px-2 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-white/5';

  const leftBorderClass = isCurrentUser
    ? 'border-l-[1px] sm:border-l-[1px] border-l-transparent'
    : 'border-l-[1px] sm:border-l-[1px] border-l-transparent';

  const rightBorderClass = isCurrentUser
    ? 'border-r-[1px] sm:border-r-[1px] border-r-transparent'
    : 'border-r-[1px] sm:border-r-[1px] border-r-transparent';

  return (
    <tr
      className={cn(
        'group transition-all duration-300',
        isCurrentUser
          ? 'bg-[color-mix(in_srgb,var(--accent-primary),transparent_90%)] shadow-inner'
          : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.04]'
      )}
    >
      <td className={cn(cellClass, leftBorderClass)}>
        <div className="flex justify-center items-center">
          <RankBadge rank={user.rank} />
        </div>
      </td>

      <td className={cellClass}>
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div
            className={cn(
              'w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex-shrink-0 flex items-center justify-center text-xs sm:text-sm font-bold transition-all duration-300',
              isCurrentUser
                ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white shadow-[0_0_1px_var(--accent-primary)]'
                : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 dark:border-white/10 dark:text-slate-300 group-hover:border-[var(--accent-primary)] group-hover:text-[var(--accent-primary)]'
            )}
            aria-hidden="true"
          >
            {user.username.slice(0, 1).toUpperCase()}
          </div>

          <div className="flex flex-col min-w-0">
            <span
              className={cn(
                'font-medium text-sm transition-colors flex items-center gap-1 sm:gap-2',
                isCurrentUser
                  ? 'text-[var(--accent-primary)] font-black text-sm sm:text-base'
                  : 'text-slate-700 dark:text-slate-200 group-hover:text-[var(--accent-primary)] dark:group-hover:text-[var(--accent-primary)]'
              )}
            >
              <span className="truncate">{user.username}</span>

              {isCurrentUser && (
                <div className="relative flex-shrink-0 flex items-center justify-center w-5 h-5 sm:w-8 sm:h-8 ml-1">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.8,
                      ease: 'easeInOut',
                    }}
                    className="absolute inset-0 text-[var(--accent-primary)]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-full h-full drop-shadow-md"
                    >
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </motion.div>
                </div>
              )}
            </span>

            {user.change > 0 && (
              <span className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wide opacity-70 group-hover:opacity-100 transition-opacity">
                <TrendingUp className="w-3 h-3" aria-hidden="true" />
                {t('rising')}
              </span>
            )}
          </div>
        </div>
      </td>

      <td
        className={cn(cellClass, 'text-right pr-4 sm:pr-6', rightBorderClass)}
      >
        <span
          className={cn(
            'font-mono font-bold inline-block transition-all',
            isCurrentUser
              ? 'text-[var(--accent-primary)] scale-110 drop-shadow-sm text-sm sm:text-lg'
              : 'text-slate-700 dark:text-slate-300 group-hover:scale-105 text-sm sm:text-base'
          )}
        >
          {user.points.toLocaleString()}
        </span>
      </td>
    </tr>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="relative w-8 h-6 sm:w-14 sm:h-8 flex items-center justify-center gap-0.5 sm:gap-1.5 rounded-md sm:rounded-lg bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.3)]">
        <span className="font-black text-xs sm:text-base text-yellow-700 dark:text-yellow-400">
          1
        </span>
        <Trophy className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-yellow-600 dark:text-yellow-400" />
        <div className="absolute -top-1 -right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-400 rounded-full animate-pulse" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-6 sm:w-14 sm:h-8 flex items-center justify-center gap-0.5 sm:gap-1.5 rounded-md sm:rounded-lg bg-slate-100 dark:bg-slate-400/10 border border-slate-300 dark:border-slate-400/30">
        <span className="font-black text-xs sm:text-base text-slate-600 dark:text-slate-300">
          2
        </span>
        <Medal className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-slate-500 dark:text-slate-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-6 sm:w-14 sm:h-8 flex items-center justify-center gap-0.5 sm:gap-1.5 rounded-md sm:rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-300 dark:border-orange-500/30">
        <span className="font-black text-xs sm:text-base text-orange-700 dark:text-orange-400">
          3
        </span>
        <Medal className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-orange-600 dark:text-orange-400" />
      </div>
    );
  }
  return (
    <span className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-100 dark:bg-white/5 font-bold text-xs sm:text-sm text-slate-500 dark:text-slate-500">
      {rank}
    </span>
  );
}
