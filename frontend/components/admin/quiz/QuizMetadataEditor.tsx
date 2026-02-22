'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const LOCALES = ['en', 'uk', 'pl'] as const;
const LOCALE_LABELS: Record<string, string> = { en: 'EN', uk: 'UK', pl: 'PL' };

interface QuizMetadataEditorProps {
  quizId: string;
  translations: Record<string, { title: string; description: string | null }>;
  timeLimitSeconds: number | null;
  csrfToken: string;
}

export function QuizMetadataEditor({
  quizId,
  translations,
  timeLimitSeconds,
  csrfToken,
}: QuizMetadataEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [activeLocale, setActiveLocale] = useState<string>('en');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [draft, setDraft] = useState(() => buildDraft(translations, timeLimitSeconds));

  function buildDraft(
    trans: Record<string, { title: string; description: string | null }>,
    timeLimit: number | null
  ) {
    const t: Record<string, { title: string; description: string }> = {};
    for (const locale of LOCALES) {
      t[locale] = {
        title: trans[locale]?.title ?? '',
        description: trans[locale]?.description ?? '',
      };
    }
    return { translations: t, timeLimitMinutes: timeLimit ? String(timeLimit / 60) : '' };
  }

  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(buildDraft(translations, timeLimitSeconds));

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function handleCancel() {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    setDraft(buildDraft(translations, timeLimitSeconds));
    setEditing(false);
    setError('');
  }

  function updateField(locale: string, field: 'title' | 'description', value: string) {
    setDraft(prev => ({
      ...prev,
      translations: {
        ...prev.translations,
        [locale]: { ...prev.translations[locale], [field]: value },
      },
    }));
  }

  async function handleSave() {
    for (const locale of LOCALES) {
      if (!draft.translations[locale].title.trim()) {
        setError(`Title is required for ${LOCALE_LABELS[locale]}`);
        setActiveLocale(locale);
        return;
      }
      if (!draft.translations[locale].description.trim()) {
        setError(`Description is required for ${LOCALE_LABELS[locale]}`);
        setActiveLocale(locale);
        return;
      }
    }

    const minutes = draft.timeLimitMinutes.trim();
    let timeLimitSec: number | null = null;
    if (minutes) {
      const parsed = Number(minutes);
      if (isNaN(parsed) || parsed <= 0) {
        setError('Time limit must be a positive number');
        return;
      }
      timeLimitSec = Math.round(parsed * 60);
    }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/quiz/${quizId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          translations: draft.translations,
          timeLimitSeconds: timeLimitSec,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to save');
        return;
      }

      setEditing(false);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const t = translations.en ?? translations.uk ?? {};
    return (
      <div className="border-border rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground text-sm font-medium">Metadata</h3>
            <p className="text-muted-foreground mt-1 text-xs">
              {t.title || 'No title'} &middot;{' '}
              {timeLimitSeconds ? `${Math.round(timeLimitSeconds / 60)} min` : 'No time limit'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="border-border text-foreground hover:bg-secondary rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border rounded-lg border p-4 space-y-4">
      <h3 className="text-foreground text-sm font-medium">Edit Metadata</h3>

      {/* Locale tabs */}
      <div className="flex gap-1">
        {LOCALES.map(locale => (
          <button
            key={locale}
            type="button"
            onClick={() => setActiveLocale(locale)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeLocale === locale
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>

      {/* Title + description for active locale */}
      <div className="space-y-3">
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Title ({LOCALE_LABELS[activeLocale]})
          </label>
          <input
            type="text"
            value={draft.translations[activeLocale].title}
            onChange={e => updateField(activeLocale, 'title', e.target.value)}
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-foreground mb-1 block text-xs font-medium">
            Description ({LOCALE_LABELS[activeLocale]})
          </label>
          <textarea
            rows={3}
            value={draft.translations[activeLocale].description}
            onChange={e => updateField(activeLocale, 'description', e.target.value)}
            className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Time limit */}
      <div>
        <label className="text-foreground mb-1 block text-xs font-medium">
          Time Limit (minutes)
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={draft.timeLimitMinutes}
          onChange={e => setDraft(prev => ({ ...prev, timeLimitMinutes: e.target.value }))}
          placeholder="No limit"
          className="border-border bg-background text-foreground w-40 rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="border-border text-foreground hover:bg-secondary rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
