'use client';

import { TrendingUp } from 'lucide-react';
import { User } from './types';

export function LeaderboardTable({ users }: { users: User[] }) {
  return (
    <div className="w-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-700/60 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <caption className="sr-only">
          Leaderboard ranking for other participants
        </caption>

        <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
          <tr>
            <th
              scope="col"
              className="px-6 py-4 text-center text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[16%]"
            >
              Rank
            </th>
            <th
              scope="col"
              className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[58%]"
            >
              UserName
            </th>
            <th
              scope="col"
              className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[25%]"
            >
              Points
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {users.map(user => (
            <tr
              key={user.id}
              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors group"
            >
              <td className="px-6 py-4 text-center font-mono font-semibold text-slate-400 dark:text-slate-500 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                {user.rank}
              </td>

              <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 ring-2 ring-transparent group-hover:ring-slate-200 dark:group-hover:ring-slate-600 transition-all"
                    aria-hidden="true"
                  >
                    <span>{user.username.slice(0, 1).toUpperCase()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {user.username}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <TrendingUp className="w-3 h-3" aria-hidden="true" />
                      Rising
                    </span>
                  </div>
                </div>
              </td>

              <td className="px-6 py-4 text-right font-mono font-bold text-slate-800 dark:text-slate-100">
                {user.points.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
