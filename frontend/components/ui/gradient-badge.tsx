import { LucideIcon } from 'lucide-react';

interface GradientBadgeProps {
  icon?: LucideIcon;
  text: string;
  className?: string;
}

export function GradientBadge({
  icon: Icon,
  text,
  className = '',
}: GradientBadgeProps) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-[#1e5eff]/20 bg-[#1e5eff]/10 px-3 py-1 text-[10px] font-bold tracking-widest text-[#1e5eff] uppercase dark:border-[#ff2d55]/20 dark:bg-[#ff2d55]/10 dark:text-[#ff2d55] ${className}`}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {text}
    </div>
  );
}
