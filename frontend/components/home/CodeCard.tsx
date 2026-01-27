import type { ReactNode } from 'react';

interface CodeCardProps {
  fileName: string;
  snippet: ReactNode;
  className?: string;
}

export function CodeCard({ fileName, snippet, className }: CodeCardProps) {
  return (
    <div
      className={`pointer-events-none absolute hidden md:block ${className}`}
      aria-hidden="true"
    >
      <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-xl shadow-xl dark:shadow-black/50 px-5 py-4 min-w-[230px] animate-card-breathe">
        <div className="flex items-center justify-between mb-3 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400/90" />
            <span className="h-2 w-2 rounded-full bg-yellow-400/90" />
            <span className="h-2 w-2 rounded-full bg-green-400/90" />
          </div>
          <span className="font-medium">{fileName}</span>
        </div>
        <code className="text-[11px] whitespace-pre leading-relaxed font-mono text-foreground/90">
          {snippet}
        </code>
      </div>
    </div>
  );
}
