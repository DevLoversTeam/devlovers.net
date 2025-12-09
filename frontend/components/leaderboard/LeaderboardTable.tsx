'use client';

import { TrendingUp } from 'lucide-react';
import { User } from './types';

export function LeaderboardTable({ users }: { users: User[] }) {
  return (
    <div className="w-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
      <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        <div className="col-span-2 text-center">Rank</div>
        <div className="col-span-7">UserName</div>
        <div className="col-span-3 text-right">Points</div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {users.map(user => (
          <div
            key={user.id}
            className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group"
          >
            <div className="col-span-2 text-center font-mono font-semibold text-slate-400 dark:text-slate-500 group-hover:text-slate-900 dark:group-hover:text-slate-200">
              {user.rank}
            </div>

            <div className="col-span-7 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 ring-2 ring-transparent group-hover:ring-slate-200 dark:group-hover:ring-slate-600 transition-all">
                {user.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-700 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {user.username}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" /> Rising
                </span>
              </div>
            </div>

            <div className="col-span-3 text-right font-mono font-bold text-slate-800 dark:text-slate-100">
              {user.points.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
