'use client';

import { useState } from 'react';
import { LeaderboardTabs } from './LeaderboardTabs';
import { LeaderboardPodium } from './LeaderboardPodium';
import { LeaderboardTable } from './LeaderboardTable';
import { User } from './types';
import { Trophy } from 'lucide-react';

interface LeaderboardClientProps {
  initialUsers: User[];
}

export default function LeaderboardClient({
  initialUsers,
}: LeaderboardClientProps) {
  const [activeTab, setActiveTab] = useState('Overall');

  const allUsers = initialUsers;

  const topThree = allUsers.slice(0, 3);
  const otherUsers = allUsers.slice(3);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-rose-50 dark:from-slate-950 dark:via-slate-950 dark:to-black -z-20" />
      <div className="pointer-events-none absolute inset-0 opacity-70 -z-10">
        <div className="absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/20" />
        <div className="absolute bottom-[-12rem] left-1/4 h-[22rem] w-[22rem] rounded-full bg-pink-300/30 blur-3xl dark:bg-fuchsia-500/20" />
        <div className="absolute bottom-[-10rem] right-0 h-[26rem] w-[26rem] rounded-full bg-violet-300/40 blur-3xl dark:bg-violet-500/20" />
      </div>

      <main className="relative max-w-4xl mx-auto px-4 py-12 flex flex-col items-center z-10">
        <div className="mb-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight flex items-center justify-center gap-3 mb-4 drop-shadow-sm">
            <Trophy
              className="w-10 h-10 md:w-12 md:h-12 text-yellow-500 fill-yellow-500"
              strokeWidth={1.5}
            />
            <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Leaderboard
            </span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 font-medium text-lg">
            Top performers of the community.
          </p>
        </div>

        <div className="mb-10">
          <LeaderboardTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="w-full mb-12">
          <LeaderboardPodium topThree={topThree} />
        </div>

        <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <LeaderboardTable users={otherUsers} />
        </div>
      </main>
    </div>
  );
}
