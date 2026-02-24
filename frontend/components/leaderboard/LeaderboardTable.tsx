'use client';

import { Medal, TrendingUp, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { AchievementPips } from './AchievementPips';
import { CurrentUser, User } from './types';
import { UserAvatar } from './UserAvatar';

interface LeaderboardTableProps {
  users: User[];
  currentUser?: CurrentUser | null;
}

const TOP_COUNT = 15;
const CONTEXT_RANGE = 2;

export function LeaderboardTable({
  users,
  currentUser,
}: LeaderboardTableProps) {
  const t = useTranslations('leaderboard');

  const topUsers = users.slice(0, TOP_COUNT);
  const normalizedCurrentUserId = currentUser ? String(currentUser.id) : null;
  const currentUsername = currentUser?.username;

  const matchedUser = users.find(
    u =>
      u.userId === normalizedCurrentUserId ||
      (currentUsername && u.username === currentUsername)
  );

  const currentUserRank = matchedUser?.rank || 0;
  const isUserInTop = currentUserRank > 0 && currentUserRank <= TOP_COUNT;

  const contextRows: User[] = [];
  if (!isUserInTop && matchedUser) {
    const userIndex = users.indexOf(matchedUser);

    if (userIndex !== -1) {
      const start = Math.max(TOP_COUNT, userIndex - CONTEXT_RANGE);
      const end = Math.min(users.length - 1, userIndex + CONTEXT_RANGE);
      for (let i = start; i <= end; i++) {
        contextRows.push(users[i]);
      }
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white/10 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/10">
        <div className="w-full">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left">
            <caption className="sr-only">{t('tableCaption')}</caption>
            <colgroup>
              <col className="w-[15%] sm:w-[12%]" />
              <col />
              <col className="w-[25%] sm:w-[20%]" />
            </colgroup>

            <thead className="bg-gray-50/50 dark:bg-neutral-800/20">
              <tr>
                <th className="w-[15%] border-b border-gray-200/50 px-2 py-3 text-center text-[10px] font-bold tracking-widest text-gray-500 uppercase sm:w-[12%] sm:px-6 sm:py-5 sm:text-xs dark:border-white/10 dark:text-gray-400">
                  {t('rank')}
                </th>
                <th className="w-auto border-b border-gray-200/50 px-2 py-3 text-xs font-bold tracking-widest text-gray-500 uppercase sm:px-6 sm:py-5 dark:border-white/10 dark:text-gray-400">
                  {t('user')}
                </th>
                <th className="w-[25%] border-b border-gray-200/50 py-3 pr-4 pl-2 text-right text-xs font-bold tracking-widest text-gray-500 uppercase sm:w-[20%] sm:px-6 sm:py-5 dark:border-white/10 dark:text-gray-400">
                  {t('score')}
                </th>
              </tr>
            </thead>

            <tbody>
              {topUsers.map(user => {
                const isMe =
                  user.userId === normalizedCurrentUserId ||
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

      {!isUserInTop && matchedUser && contextRows.length > 0 && (
        <>
          {contextRows[0].rank > TOP_COUNT + 1 && (
            <div className="py-2 text-center text-xl font-bold tracking-widest text-gray-400/50 select-none dark:text-white/20">
              • • •
            </div>
          )}

          <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white/10 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/10">
            <table className="w-full table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                <col className="w-[15%] sm:w-[12%]" />
                <col />
                <col className="w-[25%] sm:w-[20%]" />
              </colgroup>
              <tbody>
                {contextRows.map(user => {
                  const isMe =
                    user.userId === normalizedCurrentUserId ||
                    (currentUsername && user.username === currentUsername);

                  return (
                    <TableRow
                      key={user.id}
                      user={user}
                      isCurrentUser={!!isMe}
                      inContext
                      t={t}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TableRow({
  user,
  isCurrentUser,
  inContext = false,
  t,
}: {
  user: User;
  isCurrentUser: boolean;
  inContext?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  // inContext = true  → glow applied on <tr>; cells stay plain
  // inContext = false → top-15 row; accent borders drawn on cells directly
  const cellClass = cn(
    'border-b px-2 py-3 sm:px-6 sm:py-4',
    isCurrentUser && !inContext
      ? 'border-t border-t-(--accent-primary)/60 border-b-(--accent-primary)/60'
      : 'border-b-gray-200/50 dark:border-b-white/5'
  );

  const leftBorderClass = cn(
    isCurrentUser && !inContext
      ? 'border-l-2 border-l-(--accent-primary)/70'
      : 'border-l border-l-transparent'
  );
  const rightBorderClass = cn(
    isCurrentUser && !inContext
      ? 'border-r-2 border-r-(--accent-primary)/70'
      : 'border-r border-r-transparent'
  );

  return (
    <tr
      className={cn(
        'group transition-all duration-300',
        isCurrentUser
          ? 'bg-[color-mix(in_srgb,var(--accent-primary),transparent_90%)]'
          : 'hover:bg-white/30 dark:hover:bg-white/5',
        isCurrentUser &&
          inContext &&
          '[box-shadow:inset_0_0_0_2px_color-mix(in_srgb,var(--accent-primary)_70%,transparent),inset_0_0_20px_color-mix(in_srgb,var(--accent-primary)_30%,transparent)]'
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
                : 'border-white/20 group-hover:border-(--accent-primary) dark:border-white/10'
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
                  : 'text-gray-800 group-hover:text-(--accent-primary) dark:text-gray-200 dark:group-hover:text-(--accent-primary)'
              )}
            >
              <span className="truncate">{user.username}</span>

              {user.achievements && user.achievements.length > 0 && (
                <AchievementPips achievements={user.achievements} />
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
              : 'text-sm text-gray-800 group-hover:scale-105 sm:text-base dark:text-gray-200'
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
      <div className="relative flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 shadow-[0_0_10px_rgba(234,179,8,0.3)] sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg">
        <span className="text-xs font-black text-yellow-600 sm:text-base dark:text-yellow-400">
          1
        </span>
        <Trophy className="h-2.5 w-2.5 text-yellow-600 sm:h-4 sm:w-4 dark:text-yellow-400" />
        <div className="absolute -top-1 -right-1 h-1.5 w-1.5 animate-pulse rounded-full bg-yellow-400 sm:h-2 sm:w-2" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-slate-500/30 bg-slate-500/10 sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg">
        <span className="text-xs font-black text-slate-600 sm:text-base dark:text-slate-300">
          2
        </span>
        <Medal className="h-2.5 w-2.5 text-slate-500 sm:h-4 sm:w-4 dark:text-slate-300" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-6 w-8 items-center justify-center gap-0.5 rounded-md border border-orange-500/30 bg-orange-500/10 sm:h-8 sm:w-14 sm:gap-1.5 sm:rounded-lg">
        <span className="text-xs font-black text-orange-600 sm:text-base dark:text-orange-400">
          3
        </span>
        <Medal className="h-2.5 w-2.5 text-orange-600 sm:h-4 sm:w-4 dark:text-orange-400" />
      </div>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-500/20 bg-gray-500/10 text-xs font-bold text-gray-500 sm:h-8 sm:w-8 sm:text-sm dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
      {rank}
    </span>
  );
}
