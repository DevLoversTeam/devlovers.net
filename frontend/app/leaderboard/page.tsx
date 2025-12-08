'use client';

import { useState } from 'react';
import { LeaderboardTabs } from '@/components/leaderboard/LeaderboardTabs';
import { LeaderboardPodium } from '@/components/leaderboard/LeaderboardPodium';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { User } from '@/components/leaderboard/types';
import { Trophy, Crown, ArrowUp, Zap, TrendingUp, Medal } from 'lucide-react';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

const generateData = (tab: string): User[] => {
  const seed = tab.length * 5;
  return Array.from({ length: 15 }).map((_, i) => ({
    id: i + 1,
    rank: i + 1,
    username:
      [
        'som-sm',
        'sanjana',
        'satohshi',
        'Cristopher',
        'Saad Khan',
        'AlexDev',
        'CodeMaster',
        'NextGuru',
        'ReactFan',
        'WebWizard',
        'VercelPro',
        'NeonUser',
        'DrizzleKing',
        'TypeHero',
        'CSSArtist',
      ][i] || `User${i + 1}`,
    points: 2500 - i * 50 + seed,
    avatar: '',
    change: Math.floor(Math.random() * 10) - 2,
  }));
};

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState('Overall');

  const allUsers = generateData(activeTab);
  const topThree = allUsers.slice(0, 3);
  const otherUsers = allUsers.slice(3);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight flex items-center justify-center gap-3 mb-2">
            <Trophy
              className="w-10 h-10 text-yellow-500 fill-yellow-500"
              strokeWidth={1.5}
            />
            Leaderboard
          </h1>
          <p className="text-slate-500 font-medium">
            Top performers of the community.
          </p>
        </div>

        <div className="mb-8">
          <LeaderboardTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="w-full mb-10">
          <LeaderboardPodium topThree={topThree} />
        </div>

        <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <LeaderboardTable users={otherUsers} />
        </div>
      </main>
    </div>
  );
}
