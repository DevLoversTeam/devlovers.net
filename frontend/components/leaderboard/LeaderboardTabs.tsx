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
