'use client';

import Image from 'next/image';

import { TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { CategorySlug } from '@/components/q&a/types';
import type { QaTabStyle } from '@/data/qaTabs';

type QaTabButtonProps = {
  value: CategorySlug;
  label: string;
  style: QaTabStyle;
  isActive: boolean;
};

export function QaTabButton({
  value,
  label,
  style,
  isActive,
}: QaTabButtonProps) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'group relative h-full min-w-[96px] !flex !w-fit !flex-none !shrink-0 !items-center !justify-start gap-2 overflow-hidden rounded-xl border border-black/5 bg-transparent px-4 py-3 text-left text-xs font-semibold text-black shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg dark:border-white/20 dark:bg-transparent dark:text-white',
        'data-[state=active]:-translate-y-0.5 data-[state=active]:shadow-lg data-[state=active]:border-2 dark:data-[state=active]:border-2',
        style.color
      )}
    >
      <span
        className={cn(
          'relative h-5 w-5 shrink-0 grayscale transition-all duration-300 group-hover:grayscale-0',
          isActive && 'grayscale-0'
        )}
      >
        <Image
          src={style.icon}
          alt={label}
          fill
          className={cn('object-contain', style.iconClassName)}
        />
      </span>
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={cn(
          'pointer-events-none absolute right-0 top-1/2 h-[120%] w-[55%] -translate-y-1/2 rounded-full blur-[24px] opacity-0 transition-opacity duration-500 group-hover:opacity-30',
          isActive && 'opacity-30',
          style.glow
        )}
      />
    </TabsTrigger>
  );
}
