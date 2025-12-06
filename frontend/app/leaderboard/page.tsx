'use client';

import React, { useState } from 'react';
import { Trophy, Crown, ArrowUp, Zap, TrendingUp, Medal } from 'lucide-react';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface User {
  id: number;
  rank: number;
  username: string;
  points: number;
  avatar: string;
  change: number;
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

function LeaderboardTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (t: string) => void;
}) {
  const tabs = ['Overall', 'Day 1', 'Day 2', 'Day 3', 'Day 4'];
  return (
    <div className="flex gap-2 p-1 overflow-x-auto max-w-full justify-center">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={cn(
            'px-6 py-2 text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap',
            activeTab === tab
              ? 'bg-slate-900 text-white shadow-lg transform scale-105'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-400 hover:text-slate-800'
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function Podium({ topThree }: { topThree: User[] }) {
  const order = [topThree[1], topThree[0], topThree[2]];

  return (
    <div className="flex items-end justify-center gap-4 md:gap-8 pb-12 pt-8 min-h-[350px]">
      {order.map((user, idx) => {
        if (!user) return null;
        const isFirst = user.rank === 1;
        const isSecond = user.rank === 2;
        const isThird = user.rank === 3;

        return (
          <div
            key={user.id}
            className={cn(
              'flex flex-col items-center transition-all duration-500',
              isFirst ? 'order-2 z-10 -mt-8' : 'z-0',
              isSecond ? 'order-1' : '',
              isThird ? 'order-3' : ''
            )}
          >
            <div className="relative mb-4 group cursor-pointer">
              {isFirst && (
                <Crown
                  className="absolute -top-10 left-1/2 -translate-x-1/2 w-8 h-8 text-yellow-500 fill-yellow-500 animate-bounce"
                  strokeWidth={1.5}
                />
              )}

              <div
                className={cn(
                  'relative flex items-center justify-center rounded-full overflow-hidden bg-white shadow-xl transition-transform duration-300 group-hover:scale-105',
                  isFirst ? 'w-28 h-28 ring-4 ring-yellow-400' : '',
                  isSecond ? 'w-20 h-20 ring-4 ring-slate-300' : '',
                  isThird ? 'w-20 h-20 ring-4 ring-orange-300' : ''
                )}
              >
                {user.avatar ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={user.avatar}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl font-bold text-slate-700">
                    {user.username.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              <div
                className={cn(
                  'absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold border-4 border-white shadow-md',
                  isFirst ? 'bg-yellow-500 text-white' : '',
                  isSecond ? 'bg-slate-400 text-white' : '',
                  isThird ? 'bg-orange-400 text-white' : ''
                )}
              >
                {user.rank}
              </div>
            </div>

            <div className="text-center mb-3">
              <div className="font-bold text-slate-800 text-base mb-1 truncate max-w-[120px]">
                {user.username}
              </div>
              <div className="font-mono font-bold text-xl text-slate-900 tracking-tight">
                {user.points}
              </div>
            </div>

            <div
              className={cn(
                'w-24 md:w-32 rounded-t-lg border-x border-t bg-gradient-to-b from-white to-slate-50 shadow-sm',
                isFirst ? 'h-40 border-yellow-400/30 from-yellow-50/50' : '',
                isSecond ? 'h-24 border-slate-300/30 from-slate-50/50' : '',
                isThird ? 'h-16 border-orange-300/30 from-orange-50/50' : ''
              )}
            />
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardTable({ users }: { users: User[] }) {
  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
        <div className="col-span-2 text-center">Rank</div>
        <div className="col-span-7">UserName</div>
        <div className="col-span-3 text-right">Points</div>
      </div>

      <div className="divide-y divide-slate-100">
        {users.map(user => (
          <div
            key={user.id}
            className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors group"
          >
            <div className="col-span-2 text-center font-mono font-semibold text-slate-400 group-hover:text-slate-900">
              {user.rank}
            </div>

            <div className="col-span-7 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 ring-2 ring-transparent group-hover:ring-slate-200 transition-all">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-700 text-sm group-hover:text-blue-600 transition-colors">
                  {user.username}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                  <TrendingUp className="w-3 h-3" /> Rising
                </span>
              </div>
            </div>

            <div className="col-span-3 text-right font-mono font-bold text-slate-800">
              {user.points.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState('Overall');

  const allUsers = generateData(activeTab);
  const topThree = allUsers.slice(0, 3);
  const otherUsers = allUsers.slice(3);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center">
        {/* Header */}
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
          <Podium topThree={topThree} />
        </div>

        <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
          <LeaderboardTable users={otherUsers} />
        </div>
      </main>
    </div>
  );
}
