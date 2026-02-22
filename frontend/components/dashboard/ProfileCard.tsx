'use client';

import { AnimatePresence,motion } from 'framer-motion';
import { Calendar, ChevronDown, Globe,Heart, Settings, Target, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { UserAvatar } from '@/components/leaderboard/UserAvatar';
import { Link } from '@/i18n/routing';

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
  totalAttempts?: number;
  globalRank?: number | null;
}

export function ProfileCard({
  user,
  locale,
  isSponsor,
  totalAttempts = 0,
  globalRank,
}: ProfileCardProps) {
  const t = useTranslations('dashboard.profile');
  const tStats = useTranslations('dashboard.stats');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const username = user.name || user.email.split('@')[0];
  const seed = `${username}-${user.id}`;
  const avatarSrc =
    user.image ||
    `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

  const cardStyles = 'dashboard-card flex flex-col p-5 sm:p-6 lg:p-8';

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const statItemBase =
    'flex flex-row items-center gap-2 sm:gap-3 rounded-2xl border border-gray-100 bg-white/50 p-2 sm:p-3 text-left dark:border-white/5 dark:bg-black/20 xl:flex-row-reverse xl:items-center xl:text-right xl:p-3 xl:px-4 transition-all hover:border-(--accent-primary)/40 hover:bg-gray-50 dark:hover:bg-white/5 dark:hover:border-(--accent-primary)/20';

  return (
    <section className={cardStyles} aria-labelledby="profile-heading">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5 sm:gap-6">
        <div className="flex items-start gap-4 sm:gap-6 min-w-0 w-full xl:w-auto xl:flex-1">
          <div className="relative shrink-0 rounded-full bg-linear-to-br from-(--accent-primary) to-(--accent-hover) p-0.75">
          <div className="relative h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24 overflow-hidden rounded-full bg-white dark:bg-neutral-900">
            <UserAvatar
              src={avatarSrc}
              username={username}
              userId={user.id}
              sizes="96px"
            />
          </div>
        </div>

        <div className="flex flex-col items-start w-full min-w-0">
          <h2
              id="profile-heading"
              className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white"
            >
              {user.name || t('defaultName')}
            </h2>
            <p className="truncate font-mono text-sm sm:text-base text-gray-500 dark:text-gray-400">
              {user.email}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-(--accent-primary)/10 px-3 py-1 text-xs font-bold tracking-wider text-(--accent-primary) uppercase">
                {user.role || t('defaultRole')}
              </span>
              {isSponsor && (
                <span className="relative inline-flex items-center gap-1.5 rounded-full bg-(--accent-primary)/10 px-3 py-1 text-xs font-bold tracking-wider text-(--accent-primary) uppercase overflow-hidden border border-(--accent-primary)/20">
                  <span className="absolute inset-0 bg-linear-to-r from-transparent via-(--accent-primary)/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                  <Heart className="h-3 w-3 fill-(--accent-primary) drop-shadow-[0_0_8px_rgba(var(--accent-primary-rgb),0.8)]" />
                  <span className="relative z-10">{t('sponsor')}</span>
                </span>
              )}
            </div>
        </div>
        </div>
        <dl className="grid w-full grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4 xl:w-auto xl:flex xl:flex-nowrap xl:items-center xl:justify-end xl:gap-2 2xl:gap-3">
            {/* Attempts */}
            <a href="#quiz-results" onClick={scrollTo('quiz-results')} className={statItemBase}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100/80 ring-1 ring-black/5 dark:bg-purple-500/20 dark:ring-white/10 xl:h-auto xl:w-auto xl:p-2.5">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex w-full flex-col items-start overflow-hidden xl:items-end">
                <dt className="truncate text-[10px] font-medium tracking-wider text-gray-500 uppercase xl:font-bold xl:text-gray-400 dark:text-gray-400 xl:mb-0.5">
                  {tStats('totalAttempts')}
                </dt>
                <dd className="truncate text-base sm:text-lg font-bold leading-tight text-gray-900 xl:text-xl xl:font-black dark:text-white">
                  {totalAttempts}
                </dd>
              </div>
            </a>

            {/* Points */}
            <a href="#stats" onClick={scrollTo('stats')} className={statItemBase}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100/80 ring-1 ring-black/5 dark:bg-amber-500/20 dark:ring-white/10 xl:h-auto xl:w-auto xl:p-2.5">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex w-full flex-col items-start overflow-hidden xl:items-end">
                <dt className="truncate text-[10px] font-medium tracking-wider text-gray-500 uppercase xl:font-bold xl:text-gray-400 dark:text-gray-400 xl:mb-0.5">
                  {t('totalPoints')}
                </dt>
                <dd className="truncate text-base sm:text-lg font-bold leading-tight text-gray-900 xl:text-xl xl:font-black dark:text-white">
                  {user.points}
                </dd>
              </div>
            </a>

            {/* Global rank */}
            <Link href="/leaderboard" className={statItemBase}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100/80 ring-1 ring-black/5 dark:bg-teal-500/20 dark:ring-white/10 xl:h-auto xl:w-auto xl:p-2.5">
                <Globe className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="flex w-full flex-col items-start overflow-hidden xl:items-end">
                <dt className="truncate text-[10px] font-medium tracking-wider text-gray-500 uppercase xl:font-bold xl:text-gray-400 dark:text-gray-400 xl:mb-0.5">
                  {t('globalRank')}
                </dt>
                <dd className="truncate text-base sm:text-lg font-bold leading-tight text-gray-900 xl:text-xl xl:font-black dark:text-white">
                  {globalRank ? `#${globalRank}` : '—'}
                </dd>
              </div>
            </Link>

            {/* Joined */}
            <div className="flex flex-row items-center gap-2 sm:gap-3 rounded-2xl border border-gray-100 bg-white/50 p-2 sm:p-3 text-left dark:border-white/5 dark:bg-black/20 xl:flex-row-reverse xl:items-center xl:text-right xl:p-3 xl:px-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100/80 ring-1 ring-black/5 dark:bg-blue-500/20 dark:ring-white/10 xl:h-auto xl:w-auto xl:p-2.5">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex w-full flex-col items-start overflow-hidden xl:items-end">
                <dt className="truncate text-[10px] font-medium tracking-wider text-gray-500 uppercase xl:font-bold xl:text-gray-400 dark:text-gray-400 xl:mb-0.5">
                  {t('joined')}
                </dt>
                <dd className="truncate text-sm sm:text-base font-bold leading-tight text-gray-700 xl:text-lg whitespace-nowrap dark:text-gray-300 xl:dark:text-gray-300">
                  {user.createdAt
                    ? new Date(user.createdAt).toLocaleDateString(locale, { year: 'numeric', month: 'short' })
                    : '—'}
                </dd>
              </div>
            </div>
          </dl>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-5 dark:border-white/5">
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className="group flex w-full items-center justify-between text-left"
          aria-expanded={isSettingsOpen}
        >
          <div className="flex items-center gap-2 text-gray-700 transition-colors group-hover:text-(--accent-primary) dark:text-gray-300">
            <Settings className="h-5 w-5" />
            <span className="font-semibold">{t('settings')}</span>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-gray-400 transition-transform duration-300 ${
              isSettingsOpen ? 'rotate-180 text-(--accent-primary)' : ''
            }`}
          />
        </button>

        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-6 flex flex-col gap-6">
                {/* Edit Name Form */}
                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/5 dark:bg-black/20">
                  <h3 className="mb-4 text-sm font-semibold tracking-wide text-gray-900 uppercase dark:text-white">
                    {t('changeName')}
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setIsSaving(true);
                      setTimeout(() => setIsSaving(false), 1000);
                    }}
                    className="flex flex-col gap-4 sm:flex-row sm:items-end"
                  >
                    <div className="flex-1">
                      <label htmlFor="name-input" className="sr-only">
                        {t('changeName')}
                      </label>
                      <input
                        id="name-input"
                        type="text"
                        defaultValue={user.name || ''}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary) dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                        placeholder={t('defaultName')}
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-(--accent-primary) px-6 text-sm font-medium text-white transition-all hover:bg-(--accent-hover) disabled:opacity-50 sm:w-auto"
                    >
                      {isSaving ? t('saving') : t('saveChanges')}
                    </button>
                  </form>
                </div>

                {/* Edit Password Form */}
                <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5 dark:border-white/5 dark:bg-black/20">
                  <h3 className="mb-4 text-sm font-semibold tracking-wide text-gray-900 uppercase dark:text-white">
                    {t('changePassword')}
                  </h3>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (e.currentTarget.checkValidity()) {
                        setIsSaving(true);
                        setTimeout(() => setIsSaving(false), 1000);
                        e.currentTarget.reset();
                      }
                    }}
                    className="flex flex-col gap-4"
                  >
                    <div>
                      <input
                        type="password"
                        placeholder={t('currentPassword')}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary) dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder={t('newPassword')}
                        minLength={8}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:border-(--accent-primary) focus:ring-1 focus:ring-(--accent-primary) dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="mt-2 inline-flex h-10 w-full self-start items-center justify-center rounded-xl bg-(--accent-primary) px-6 text-sm font-medium text-white transition-all hover:bg-(--accent-hover) disabled:opacity-50 sm:w-auto"
                    >
                      {isSaving ? t('saving') : t('saveChanges')}
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </section>
  );
}