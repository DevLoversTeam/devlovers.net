'use client';

import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { UserAvatar } from '@/components/leaderboard/UserAvatar';

interface ProfileCardProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string | null;
    points: number;
    createdAt: Date | null;
  };
  locale: string;
  isSponsor?: boolean;
}

export function ProfileCard({
  user,
  locale,
  isSponsor,
}: ProfileCardProps) {
  const t = useTranslations('dashboard.profile');
  const username = user.name || user.email.split('@')[0];
  const seed = `${username}-${user.id}`;
  const avatarSrc =
    user.image ||
    `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  const cardStyles = `
    relative overflow-hidden rounded-2xl flex flex-col
    border border-gray-200 dark:border-white/10
    bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl
    p-4 sm:p-6 md:p-8 transition-all hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30
  `;

  return (
    <section className={cardStyles} aria-labelledby="profile-heading">
      <div className="flex items-start gap-6">
        <div className="relative shrink-0 rounded-full bg-linear-to-br from-(--accent-primary) to-(--accent-hover) p-0.75">
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white dark:bg-neutral-900">
            <UserAvatar
              src={avatarSrc}
              username={username}
              userId={user.id}
              sizes="80px"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h2
            id="profile-heading"
            className="text-2xl font-bold text-gray-900 dark:text-white"
          >
            {user.name || t('defaultName')}
          </h2>
          <p className="truncate font-mono text-sm text-gray-500 dark:text-gray-400">
            {user.email}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-(--accent-primary)/10 px-3 py-1 text-xs font-bold tracking-wider text-(--accent-primary) uppercase">
              {user.role || t('defaultRole')}
            </span>
            {isSponsor && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-(--sponsor)/10 px-3 py-1 text-xs font-bold tracking-wider text-(--sponsor) uppercase dark:bg-(--sponsor)/15 dark:text-(--sponsor)"
              >
                <Heart className="h-3 w-3 fill-current" />
                {t('sponsor')}
              </span>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-8 flex items-end justify-between border-t border-gray-100 pt-6 dark:border-white/5">
        <div>
          <dt className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
            {t('totalPoints')}
          </dt>
          <dd className="mt-1 text-3xl font-black text-gray-900 dark:text-white">
            {user.points}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
            {t('joined')}
          </dt>
          <dd className="mt-2 text-lg font-medium text-gray-700 dark:text-gray-300">
            {user.createdAt
              ? new Date(user.createdAt).toLocaleDateString(locale)
              : '-'}
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex justify-center pt-6">
        {isSponsor ? (
          <a
            href="https://github.com/sponsors/DevLoversTeam"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border border-(--sponsor)/30 bg-(--sponsor)/10 px-8 py-3 text-sm font-semibold tracking-widest uppercase text-(--sponsor) transition-all hover:scale-105 hover:border-(--accent-primary)/30 hover:bg-(--accent-primary) hover:text-white dark:border-(--sponsor)/30 dark:bg-(--sponsor)/15 dark:text-(--sponsor) dark:hover:border-(--accent-primary)/30 dark:hover:bg-(--accent-primary) dark:hover:text-white"
          >
            <Heart className="h-4 w-4 fill-current group-hover:fill-none" />
            {/* Mobile: static text, Desktop: text swap on hover */}
            <span className="sm:hidden">{t('sponsorThanks')}</span>
            <span className="hidden sm:grid">
              <span className="col-start-1 row-start-1 transition-all group-hover:translate-y-full group-hover:opacity-0">
                {t('sponsorThanks')}
              </span>
              <span className="col-start-1 row-start-1 -translate-y-full opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                {t('sponsorMore')}
              </span>
            </span>
          </a>
        ) : (
          <a
            href="https://github.com/sponsors/DevLoversTeam"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-(--accent-primary) px-8 py-3 text-sm font-semibold tracking-widest uppercase text-white transition-all hover:scale-105 hover:bg-(--accent-hover)"

          >
            <Heart className="h-4 w-4" />
            <span className="relative z-10">{t('becomeSponsor')}</span>
          </a>
        )}
      </div>
    </section>
  );
}
