'use client';

import { useState } from 'react';

import { slugify } from '@/lib/shop/slug';

interface InlineBlogAuthorFormProps {
  csrfToken: string;
  onCreated: (author: { id: string; name: string }) => void;
  onCancel: () => void;
}

export function InlineBlogAuthorForm({
  csrfToken,
  onCreated,
  onCancel,
}: InlineBlogAuthorFormProps) {
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [names, setNames] = useState({ en: '', uk: '', pl: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleNameChange(locale: 'en' | 'uk' | 'pl', value: string) {
    setNames(prev => ({ ...prev, [locale]: value }));
    if (locale === 'en' && !slugTouched) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit() {
    setError('');

    if (!names.en.trim() || !names.uk.trim() || !names.pl.trim()) {
      setError('All 3 locale names are required');
      return;
    }
    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/blog/authors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          slug,
          translations: {
            en: { name: names.en.trim() },
            uk: { name: names.uk.trim() },
            pl: { name: names.pl.trim() },
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to create author');
        return;
      }

      onCreated(data.author);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-4">
      <p className="text-foreground text-sm font-medium">New Author</p>

      <div className="grid grid-cols-3 gap-3">
        {(['en', 'uk', 'pl'] as const).map(locale => (
          <div key={locale}>
            <label className="text-muted-foreground mb-1 block text-xs">
              Name ({locale.toUpperCase()})
            </label>
            <input
              type="text"
              value={names[locale]}
              onChange={e => handleNameChange(locale, e.target.value)}
              className="border-border bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
              placeholder={`Author name (${locale})`}
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
          placeholder="author-slug"
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
          {saving ? 'Creating...' : 'Create Author'}
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
