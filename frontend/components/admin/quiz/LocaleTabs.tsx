'use client';

import { cn } from '@/lib/utils';

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UK' },
  { code: 'pl', label: 'PL' },
] as const;

export type AdminLocale = (typeof LOCALES)[number]['code'];

interface LocaleTabsProps {
  active: AdminLocale;
  onChange: (locale: AdminLocale) => void;
  missingLocales?: Set<string>;
  dirtyLocales?: Set<string>;
}

export function LocaleTabs({
  active,
  onChange,
  missingLocales,
  dirtyLocales,
}: LocaleTabsProps) {
  return (
    <div className="flex gap-1">
      {LOCALES.map(({ code, label }) => {
        const isDirty = dirtyLocales?.has(code);
        const isMissing = missingLocales?.has(code);

        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={cn(
              'relative rounded-md px-3 py-1 text-xs font-medium transition-colors',
              active === code
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            {isDirty && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-400" />
            )}
            {!isDirty && isMissing && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
