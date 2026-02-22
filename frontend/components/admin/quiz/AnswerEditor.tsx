'use client';

import { cn } from '@/lib/utils';

const ORDER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

interface AnswerEditorProps {
  answerId: string;
  displayOrder: number;
  answerText: string;
  isCorrect: boolean;
  onTextChange: (text: string) => void;
  onCorrectChange: () => void;
}

export function AnswerEditor({
  answerId,
  displayOrder,
  answerText,
  isCorrect,
  onTextChange,
  onCorrectChange,
}: AnswerEditorProps) {
  const label = ORDER_LABELS[displayOrder - 1] ?? `${displayOrder}`;

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={onCorrectChange}
        className={cn(
          'mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
          isCorrect
            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
            : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
        )}
        title={isCorrect ? 'Correct answer' : 'Mark as correct'}
        aria-label={`Answer ${label}: ${isCorrect ? 'correct' : 'mark as correct'}`}
      >
        {label}
      </button>

      <input
        type="text"
        value={answerText}
        onChange={e => onTextChange(e.target.value)}
        placeholder={`Answer ${label}...`}
        className="border-border bg-background text-foreground placeholder:text-muted-foreground flex-1 rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:ring-[var(--accent-primary)] focus:outline-none"
        id={`answer-${answerId}`}
      />
    </div>
  );
}
