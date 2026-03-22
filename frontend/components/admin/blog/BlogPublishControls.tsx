'use client';

import { cn } from '@/lib/utils';

export type PublishMode = 'draft' | 'publish' | 'schedule';

interface BlogPublishControlsProps {
  mode: PublishMode;
  scheduledDate: string;
  onModeChange: (mode: PublishMode) => void;
  onScheduledDateChange: (date: string) => void;
  currentStatus?: 'draft' | 'published' | 'scheduled';
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-amber-500/10 text-amber-500',
  },
  published: {
    label: 'Published',
    className: 'bg-emerald-500/10 text-emerald-500',
  },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-sky-500/10 text-sky-500',
  },
};

function RadioOption({
  value,
  label,
  description,
  checked,
  onChange,
}: {
  value: PublishMode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: PublishMode) => void;
}) {
  return (
    <label
      className={cn(
        'border-border flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
        checked
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
          : 'hover:border-foreground/20'
      )}
    >
      <input
        type="radio"
        name="publishMode"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="mt-0.5 accent-[var(--accent-primary)]"
      />
      <div>
        <span className="text-foreground text-sm font-medium">{label}</span>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </label>
  );
}

export function BlogPublishControls({
  mode,
  scheduledDate,
  onModeChange,
  onScheduledDateChange,
  currentStatus,
}: BlogPublishControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-foreground text-sm font-medium">
          Publish status
        </span>
        {currentStatus && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_BADGE[currentStatus].className
            )}
          >
            Currently: {STATUS_BADGE[currentStatus].label}
          </span>
        )}
      </div>

      <div className="grid gap-2">
        <RadioOption
          value="draft"
          label="Save as draft"
          description="Not visible on the public site"
          checked={mode === 'draft'}
          onChange={onModeChange}
        />
        <RadioOption
          value="publish"
          label="Publish now"
          description="Immediately visible on the blog"
          checked={mode === 'publish'}
          onChange={onModeChange}
        />
        <RadioOption
          value="schedule"
          label="Schedule"
          description="Publish at a specific date and time"
          checked={mode === 'schedule'}
          onChange={onModeChange}
        />
      </div>

      {mode === 'schedule' && (
        <input
          type="datetime-local"
          value={scheduledDate}
          onChange={e => onScheduledDateChange(e.target.value)}
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
