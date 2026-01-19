'use client';

import { TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { User } from './types';

export function LeaderboardTable({ users }: { users: User[] }) {
  const t = useTranslations('leaderboard');

  return (
    <div className="w-full bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 dark:border-slate-700/50 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <caption className="sr-only">{t('tableCaption')}</caption>

        <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
          <tr>
            <th
              scope="col"
              className="px-6 py-5 text-center text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-[15%]"
            >
              {t('rank')}
            </th>
            <th
              scope="col"
              className="px-6 py-5 text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-[60%]"
            >
              {t('user')}
            </th>
            <th
              scope="col"
              className="px-6 py-5 text-right text-xs font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest w-[25%]"
            >
              {t('score')}
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {users.map(user => (
            <tr
              key={user.id}
              className="group transition-colors hover:bg-white/80 dark:hover:bg-slate-800/80"
            >
              <td className="px-6 py-4 text-center font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                {user.rank}
              </td>

              <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 shadow-inner group-hover:scale-110 transition-transform duration-300"
                    aria-hidden="true"
                  >
                    {user.username.slice(0, 1).toUpperCase()}
                  </div>

                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {user.username}
                    </span>
                    {user.change > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                        <TrendingUp className="w-3 h-3" aria-hidden="true" />
                        {t('rising')}
                      </span>
                    )}
                  </div>
                </div>
              </td>

              <td className="px-6 py-4 text-right">
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100 group-hover:scale-105 inline-block transition-transform">
                  {user.points.toLocaleString()}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
