'use client';

import { useTranslations } from 'next-intl';

interface ProfileCardProps {
  user: {
    name: string | null;
    email: string;
    role: string | null;
    points: number;
    createdAt: Date | null;
  };
  locale: string;
}

export function ProfileCard({ user, locale }: ProfileCardProps) {
  const t = useTranslations('dashboard.profile');

  const cardStyles = `
    relative overflow-hidden rounded-[2rem]
    border border-slate-200/70 dark:border-slate-700/80
    bg-white/60 dark:bg-slate-900/60 backdrop-blur-md
    shadow-[0_18px_45px_rgba(15,23,42,0.05)]
    dark:shadow-[0_22px_60px_rgba(0,0,0,0.2)]
    p-8 transition-all hover:border-sky-200 dark:hover:border-sky-800
  `;

  return (
    <section className={cardStyles} aria-labelledby="profile-heading">
      <div className="flex items-start gap-6">
        <div
          className="relative rounded-full bg-gradient-to-br from-sky-400 to-pink-400 p-[3px]"
          aria-hidden="true"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
          </div>
        </div>

        <div className="flex-1">
          <h2
            id="profile-heading"
            className="text-2xl font-bold text-slate-800 dark:text-slate-100"
          >
            {user.name || t('defaultName')}
          </h2>
          <p className="font-mono text-sm text-slate-500 dark:text-slate-400">
            {user.email}
          </p>

          <div className="mt-3 inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-bold tracking-wider text-sky-700 uppercase dark:bg-sky-900/30 dark:text-sky-300">
            {user.role || t('defaultRole')}
          </div>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-slate-100 pt-6 dark:border-slate-800/50">
        <div>
          <dt className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {t('totalPoints')}
          </dt>

          <dd className="mt-1 text-3xl font-black text-slate-800 dark:text-white">
            {user.points}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
            {t('joined')}
          </dt>
          <dd className="mt-2 text-lg font-medium text-slate-700 dark:text-slate-300">
            {user.createdAt
              ? new Date(user.createdAt).toLocaleDateString(locale)
              : '-'}
          </dd>
        </div>
      </dl>
    </section>
  );
}
