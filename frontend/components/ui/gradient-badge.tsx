import { LucideIcon } from "lucide-react"

interface GradientBadgeProps {
  icon?: LucideIcon
  text: string
  className?: string
}

export function GradientBadge({ icon: Icon, text, className = "" }: GradientBadgeProps) {
  return (
    <div 
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full 
        border border-[#1e5eff]/20 dark:border-[#ff2d55]/20 
        bg-[#1e5eff]/10 dark:bg-[#ff2d55]/10 
        text-[#1e5eff] dark:text-[#ff2d55] 
        text-[10px] font-bold uppercase tracking-widest ${className}`}
    >
      {Icon && <Icon size={12} aria-hidden="true" />}
      {text}
    </div>
  )
}
