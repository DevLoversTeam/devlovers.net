'use client';

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
}

export function ProfileCard({ user, locale }: ProfileCardProps) {
  const t = useTranslations('dashboard.profile');
  const username = user.name || user.email.split('@')[0];
  const seed = `${username}-${user.id}`;
  const avatarSrc =
    user.image ||
    `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  const cardStyles = `
    relative overflow-hidden rounded-2xl
    border border-gray-100 dark:border-white/5
    bg-white/60 dark:bg-neutral-900/60 backdrop-blur-xl
    p-8 transition-all hover:border-(--accent-primary)/30 dark:hover:border-(--accent-primary)/30
  `;

  return (
    <section className={cardStyles} aria-labelledby="profile-heading">
      <div className="flex items-start gap-6">
        <div
          className="relative shrink-0 rounded-full bg-linear-to-br from-(--accent-primary) to-(--accent-hover) p-0.75"
        >
          <div className="relative h-20 w-20 overflow-hidden rounded-full bg-white dark:bg-neutral-900">
            <UserAvatar
              src={avatarSrc}
              username={username}
              userId={user.id}
              sizes="80px"
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h2
            id="profile-heading"
            className="text-2xl font-bold text-gray-900 dark:text-white"
          >
            {user.name || t('defaultName')}
          </h2>
          <p className="truncate font-mono text-sm text-gray-500 dark:text-gray-400">
            {user.email}
          </p>

          <div className="mt-3 inline-flex items-center rounded-full bg-(--accent-primary)/10 px-3 py-1 text-xs font-bold tracking-wider text-(--accent-primary) uppercase">
            {user.role || t('defaultRole')}
          </div>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-gray-100 pt-6 dark:border-white/5">
        <div>
          <dt className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
            {t('totalPoints')}
          </dt>

          <dd className="mt-1 text-3xl font-black text-gray-900 dark:text-white">
            {user.points}
          </dd>
        </div>
        <div>
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
    </section>
  );
}
