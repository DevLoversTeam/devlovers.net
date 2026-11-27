import { useId } from 'react';

import { type Locale, locales } from '@/i18n/config';

interface InlineCreationFieldsProps {
  title: string;
  fieldLabel: string;
  fieldPlaceholder: string;
  slugPlaceholder: string;
  submitLabel: string;
  values: Record<Locale, string>;
  slug: string;
  error: string;
  saving: boolean;
  onValueChange: (locale: Locale, value: string) => void;
  onSlugChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function InlineCreationFields({
  title,
  fieldLabel,
  fieldPlaceholder,
  slugPlaceholder,
  submitLabel,
  values,
  slug,
  error,
  saving,
  onValueChange,
  onSlugChange,
  onSubmit,
  onCancel,
}: InlineCreationFieldsProps) {
  const id = useId();

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">{title}</p>

      <div className="grid grid-cols-3 gap-3">
        {locales.map(locale => (
          <div key={locale}>
            <label
              htmlFor={`${id}-${locale}`}
              className="text-muted-foreground mb-1 block text-xs"
            >
              {fieldLabel} ({locale.toUpperCase()})
            </label>
            <input
              id={`${id}-${locale}`}
              type="text"
              value={values[locale]}
              onChange={event => onValueChange(locale, event.target.value)}
              className="border-border bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
              placeholder={`${fieldPlaceholder} (${locale})`}
            />
          </div>
        ))}
      </div>

      <div>
        <label
          htmlFor={`${id}-slug`}
          className="text-muted-foreground mb-1 block text-xs"
        >
          Slug
        </label>
        <input
          id={`${id}-slug`}
          type="text"
          value={slug}
          onChange={event => onSlugChange(event.target.value)}
          className="border-border bg-background text-foreground w-full max-w-xs rounded-md border px-3 py-1.5 text-sm"
          placeholder={slugPlaceholder}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Creating...' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
