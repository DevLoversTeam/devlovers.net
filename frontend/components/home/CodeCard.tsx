import type { ReactNode } from 'react';

interface CodeCardProps {
  fileName: string;
  snippet: ReactNode;
  className?: string;
}

export function CodeCard({ fileName, snippet, className }: CodeCardProps) {
  return (
    <div
      className={`pointer-events-none absolute hidden lg:block ${className} animate-card-breathe`}
      aria-hidden="true"
    >
      <div className="absolute top-1/3 -left-4 -right-4 -bottom-6 bg-[var(--accent-primary)]/8 rounded-3xl blur-2xl" />

      <div className="absolute top-1/2 -left-2 -right-2 -bottom-4 bg-[var(--accent-primary)]/12 rounded-2xl blur-xl" />

      <div className="absolute top-2/3 -left-1 -right-1 -bottom-2 bg-[var(--accent-primary)]/15 rounded-2xl blur-md" />

      <div className="relative rounded-2xl border border-[var(--accent-primary)]/20 bg-card/90 backdrop-blur-xl shadow-2xl dark:shadow-[var(--accent-primary)]/10 px-3.5 py-3 min-w-[180px] max-w-[200px] overflow-hidden">
        <div className="flex items-center justify-between mb-2 text-[9px] text-muted-foreground/80">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400/80 shadow-sm" />
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/80 shadow-sm" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-400/80 shadow-sm" />
          </div>
          <span className="font-medium text-[8.5px]">{fileName}</span>
        </div>

        <code className="text-[10px] whitespace-pre leading-relaxed font-mono text-foreground/85 block relative z-10">
          {snippet}
        </code>
      </div>
    </div>
  );
}
