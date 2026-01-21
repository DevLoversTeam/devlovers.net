'use client';

import { useTranslations } from 'next-intl';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardTable } from './LeaderboardTable';
import { User } from './types';

interface LeaderboardClientProps {
  initialUsers: User[];
}

export default function LeaderboardClient({
  initialUsers,
}: LeaderboardClientProps) {
  const t = useTranslations('leaderboard');

  const usersWithPoints = initialUsers.filter(user => user.points > 0);
  const hasResults = usersWithPoints.length > 0;

  const topThree = hasResults ? usersWithPoints.slice(0, 3) : [];
  const otherUsers = usersWithPoints.slice(3);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black -z-20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-70 -z-10"
        aria-hidden="true"
      >
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-200 dark:bg-purple-900/20 rounded-full blur-3xl opacity-50 animate-blob" />
        <div className="absolute top-1/4 -right-32 w-80 h-80 bg-sky-200 dark:bg-sky-900/20 rounded-full blur-3xl opacity-50 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-200 dark:bg-pink-900/20 rounded-full blur-3xl opacity-50 animate-blob animation-delay-4000" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-12 flex flex-col items-center z-10">
        <header className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center justify-center p-3 mb-6 rounded-full bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/50">
            <span className="text-2xl mr-2" role="img" aria-label="Trophy">
              🏆
            </span>
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              {t('championsArena')}
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tighter drop-shadow-sm">
            <span className="bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 bg-clip-text text-transparent">
              {t('title')}
            </span>
          </h1>

          <p className="text-slate-600 dark:text-slate-400 font-medium text-lg max-w-md mx-auto leading-relaxed">
            {t('subtitle')}
          </p>
        </header>

        <div className="w-full flex flex-col items-center">
          <div className="w-full mb-16">
            {hasResults ? (
              <LeaderboardPodium topThree={topThree} />
            ) : (
              <div className="text-center py-16" role="status">
                <p
                  className="text-6xl mb-4 grayscale opacity-50"
                  aria-hidden="true"
                >
                  🏆
                </p>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                  {t('noResults')}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  {t('beFirst')}
                </p>
              </div>
            )}
          </div>

          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            {hasResults && <LeaderboardTable users={otherUsers} />}
          </div>
        </div>
      </div>
    </div>
  );
}
