'use client';

import { useState } from 'react';

import { slugify } from '@/lib/shop/slug';

interface InlineCategoryFormProps {
  csrfToken: string;
  onCreated: (category: { id: string; slug: string; title: string }) => void;
  onCancel: () => void;
}

export function InlineCategoryForm({
  csrfToken,
  onCreated,
  onCancel,
}: InlineCategoryFormProps) {
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [titles, setTitles] = useState({ en: '', uk: '', pl: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleTitleChange(locale: 'en' | 'uk' | 'pl', value: string) {
    setTitles(prev => ({ ...prev, [locale]: value }));
    if (locale === 'en' && !slugTouched) {
      setSlug(slugify(value));
    }
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
      const res = await fetch('/api/admin/categories', {
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

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to create category');
        return;
      }

      onCreated(data.category);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">New Category</p>

      <div className="grid grid-cols-3 gap-3">
        {(['en', 'uk', 'pl'] as const).map(locale => (
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
          onChange={e => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
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
