'use client';

import { useState } from 'react';

import { useAutoSlug } from '@/components/admin/useAutoSlug';
import { type Locale, locales } from '@/i18n/config';

interface InlineBlogCategoryFormProps {
  csrfToken: string;
  onCreated: (category: { id: string; slug: string; title: string }) => void;
  onCancel: () => void;
}

export function InlineBlogCategoryForm({
  csrfToken,
  onCreated,
  onCancel,
}: InlineBlogCategoryFormProps) {
  const { slug, updateFromTitle, setManualSlug } = useAutoSlug();
  const [titles, setTitles] = useState({ en: '', uk: '', pl: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleTitleChange(locale: Locale, value: string) {
    setTitles(prev => ({ ...prev, [locale]: value }));
    updateFromTitle(locale, value);
  }

  async function handleSubmit() {
    setError('');

    if (!titles.en.trim() || !titles.uk.trim() || !titles.pl.trim()) {
      setError('All 3 locale titles are required');
      return;
    }
    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/blog/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          slug,
          translations: {
            en: { title: titles.en.trim() },
            uk: { title: titles.uk.trim() },
            pl: { title: titles.pl.trim() },
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to create category');
        return;
      }

      const data = await res.json();
      onCreated(data.category);

    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">New Blog Category</p>

      <div className="grid grid-cols-3 gap-3">
        {locales.map(locale => (
          <div key={locale}>
            <label className="text-muted-foreground mb-1 block text-xs">
              Title ({locale.toUpperCase()})
            </label>
            <input
              type="text"
              value={titles[locale]}
              onChange={e => handleTitleChange(locale, e.target.value)}
              className="border-border bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
              placeholder={`Category title (${locale})`}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="text-muted-foreground mb-1 block text-xs">Slug</label>
        <input
          type="text"
          value={slug}
          onChange={e => setManualSlug(e.target.value)}
          className="border-border bg-background text-foreground w-full max-w-xs rounded-md border px-3 py-1.5 text-sm"
          placeholder="category-slug"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Category'}
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
