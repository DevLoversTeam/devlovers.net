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
      <div className="absolute top-1/3 -right-4 -bottom-6 -left-4 rounded-3xl bg-[var(--accent-primary)]/8 blur-2xl" />

      <div className="absolute top-1/2 -right-2 -bottom-4 -left-2 rounded-2xl bg-[var(--accent-primary)]/12 blur-xl" />

      <div className="absolute top-2/3 -right-1 -bottom-2 -left-1 rounded-2xl bg-[var(--accent-primary)]/15 blur-md" />

      <div className="bg-card/90 relative max-w-[200px] min-w-[180px] overflow-hidden rounded-2xl border border-[var(--accent-primary)]/20 px-3.5 py-3 shadow-2xl backdrop-blur-xl dark:shadow-[var(--accent-primary)]/10">
        <div className="text-muted-foreground/80 mb-2 flex items-center justify-between text-[9px]">
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400/80 shadow-sm" />
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400/80 shadow-sm" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-400/80 shadow-sm" />
          </div>
          <span className="text-[8.5px] font-medium">{fileName}</span>
        </div>

        <code className="text-foreground/85 relative z-10 block font-mono text-[10px] leading-relaxed whitespace-pre">
          {snippet}
        </code>
      </div>
    </div>
  );
}
