'use client';

import { motion } from 'framer-motion';
import { Heart, Medal, TrendingUp, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { CurrentUser, User } from './types';
import { UserAvatar } from './UserAvatar';

interface LeaderboardTableProps {
  users: User[];
  currentUser?: CurrentUser | null;
}

export function LeaderboardTable({
  users,
  currentUser,
}: LeaderboardTableProps) {
  const t = useTranslations('leaderboard');

  const topUsers = users.slice(0, 20);
  const normalizedCurrentUserId = currentUser ? String(currentUser.id) : null;
  const currentUsername = currentUser?.username;

  const matchedUser = users.find(
    u =>
      String(u.id) === normalizedCurrentUserId ||
      (currentUsername && u.username === currentUsername)
  );

  const currentUserRank = matchedUser?.rank || 0;
  const isUserInTop = currentUserRank > 0 && currentUserRank <= 20;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:shadow-2xl">
        <div className="w-full">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left">
            <caption className="sr-only">{t('tableCaption')}</caption>
            <colgroup>
              <col className="w-[15%] sm:w-[12%]" />
              <col />
              <col className="w-[25%] sm:w-[20%]" />
            </colgroup>

            <thead className="bg-slate-50/80 dark:bg-white/5">
              <tr>
                <th className="w-[15%] border-b border-slate-200 px-2 py-3 text-center text-[10px] font-bold tracking-widest text-slate-500 uppercase sm:w-[12%] sm:px-6 sm:py-5 sm:text-xs dark:border-white/10 dark:text-slate-400">
                  {t('rank')}
                </th>
                <th className="w-auto border-b border-slate-200 px-2 py-3 text-xs font-bold tracking-widest text-slate-500 uppercase sm:px-6 sm:py-5 dark:border-white/10 dark:text-slate-400">
                  {t('user')}
                </th>
                <th className="w-[25%] border-b border-slate-200 py-3 pr-4 pl-2 text-right text-xs font-bold tracking-widest text-slate-500 uppercase sm:w-[20%] sm:px-6 sm:py-5 dark:border-white/10 dark:text-slate-400">
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
          <div className="py-2 text-center text-xl font-bold tracking-widest text-slate-400 select-none dark:text-slate-600">
            • • •
          </div>

          <div className="overflow-hidden rounded-2xl border-2 border-(--accent-primary) bg-white shadow-[0_0_20px_var(--accent-primary)] backdrop-blur-md dark:bg-white/5">
            <div className="w-full">
              <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                <colgroup>
                  <col className="w-[15%] sm:w-[12%]" />
                  <col />
                  <col className="w-[25%] sm:w-[20%]" />
                </colgroup>
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

  const leftBorderClass = 'border-l border-l-transparent';
  const rightBorderClass = 'border-r border-r-transparent';

  return (
    <tr
      className={cn(
        'group transition-all duration-300',
        isCurrentUser
          ? 'bg-[color-mix(in_srgb,var(--accent-primary),transparent_90%)] shadow-inner'
          : 'hover:bg-slate-50/60 dark:hover:bg-white/4'
      )}
    >
      <td className={cn(cellClass, leftBorderClass)}>
        <div className="flex items-center justify-center">
          <RankBadge rank={user.rank} />
        </div>
      </td>

      <td className={cellClass}>
        <div className="flex items-center gap-2 overflow-hidden sm:gap-4">
          <div
            className={cn(
              'relative h-8 w-8 shrink-0 overflow-hidden rounded-full border transition-all duration-300 sm:h-10 sm:w-10',
              isCurrentUser
                ? 'border-(--accent-primary) shadow-[0_0_1px_var(--accent-primary)]'
                : 'border-slate-200 group-hover:border-(--accent-primary) dark:border-white/10'
            )}
          >
            <UserAvatar
              src={user.avatar}
              username={user.username}
              userId={user.userId}
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <span
              className={cn(
                'flex items-center gap-1 text-sm font-medium transition-colors sm:gap-2',
                isCurrentUser
                  ? 'text-sm font-black text-(--accent-primary) sm:text-base'
                  : 'text-slate-700 group-hover:text-(--accent-primary) dark:text-slate-200 dark:group-hover:text-(--accent-primary)'
              )}
            >
              <span className="truncate">{user.username}</span>

              {user.isSponsor && (
                <a
                  href="https://github.com/sponsors/DevLoversTeam"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:hover:bg-amber-500/25"
                >
                  <Heart className="h-2.5 w-2.5 fill-current" />
                  <span className="hidden sm:inline">{t('sponsor')}</span>
                </a>
              )}

              {isCurrentUser && (
                <div className="relative ml-1 flex h-5 w-5 shrink-0 items-center justify-center sm:h-8 sm:w-8">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.8,
                      ease: 'easeInOut',
                    }}
                    className="absolute inset-0 text-(--accent-primary)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-full w-full drop-shadow-md"
                    >
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </motion.div>
                </div>
              )}
            </span>

            {user.change > 0 && (
              <span className="hidden items-center gap-1 text-[10px] font-bold tracking-wide text-emerald-600 uppercase opacity-70 transition-opacity group-hover:opacity-100 sm:flex dark:text-emerald-400">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                {t('rising')}
              </span>
            )}
          </div>
        </div>
      </td>

      <td
        className={cn(cellClass, 'pr-4 text-right sm:pr-6', rightBorderClass)}
      >
        <span
          className={cn(
            'inline-block font-mono font-bold transition-all',
            isCurrentUser
              ? 'scale-110 text-sm text-(--accent-primary) drop-shadow-sm sm:text-lg'
              : 'text-sm text-slate-700 group-hover:scale-105 sm:text-base dark:text-slate-300'
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
      <div className="relative flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-yellow-500/50 bg-yellow-100 shadow-[0_0_10px_rgba(234,179,8,0.3)] sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg dark:bg-yellow-500/20">
        <span className="text-xs font-black text-yellow-700 sm:text-base dark:text-yellow-400">
          1
        </span>
        <Trophy className="h-2.5 w-2.5 text-yellow-600 sm:h-4 sm:w-4 dark:text-yellow-400" />
        <div className="absolute -top-1 -right-1 h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400 sm:h-2 sm:w-2" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-slate-300 bg-slate-100 sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg dark:border-slate-400/30 dark:bg-slate-400/10">
        <span className="text-xs font-black text-slate-600 sm:text-base dark:text-slate-300">
          2
        </span>
        <Medal className="h-2.5 w-2.5 text-slate-500 sm:h-4 sm:w-4 dark:text-slate-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-orange-300 bg-orange-50 sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg dark:border-orange-500/30 dark:bg-orange-500/10">
        <span className="text-xs font-black text-orange-700 sm:text-base dark:text-orange-400">
          3
        </span>
        <Medal className="h-2.5 w-2.5 text-orange-600 sm:h-4 sm:w-4 dark:text-orange-400" />
      </div>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500 sm:h-8 sm:w-8 sm:text-sm dark:bg-white/5 dark:text-slate-500">
      {rank}
    </span>
  );
}
