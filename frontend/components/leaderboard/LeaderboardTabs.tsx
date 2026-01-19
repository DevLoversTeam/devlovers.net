'use client';

import { cn } from '@/lib/utils';

interface LeaderboardTabsProps {
  activeTab: string;
  onTabChange: (t: string) => void;
}

export function LeaderboardTabs({
  activeTab,
  onTabChange,
}: LeaderboardTabsProps) {
  const tabs = ['Overall', 'Day 1', 'Day 2', 'Day 3', 'Day 4'];

  return (
    <nav
      className="flex gap-2 p-1.5 bg-slate-100/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-full border border-slate-200/50 dark:border-slate-700/50"
      role="tablist"
      aria-label="Leaderboard time period"
    >
      {tabs.map(tab => {
        const isActive = activeTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            role="tab"
            aria-selected={isActive}
            aria-controls="leaderboard-panel"
            id={`tab-${tab.replace(/\s+/g, '-')}`}
            className={cn(
              'px-5 py-2 text-sm font-semibold rounded-full transition-all duration-300 whitespace-nowrap',
              isActive
                ? 'bg-gradient-to-r from-sky-500 via-indigo-500 to-pink-500 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50'
            )}
          >
            {tab}
          </button>
        );
      })}
    </nav>
  );
}
