'use client';

import { useState } from 'react';

import { InlineCreationFields } from '@/components/admin/InlineCreationFields';
import { useAutoSlug } from '@/components/admin/useAutoSlug';
import type { Locale } from '@/i18n/config';

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
  const { slug, updateFromTitle, setManualSlug } = useAutoSlug();
  const [names, setNames] = useState({ en: '', uk: '', pl: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleNameChange(locale: Locale, value: string) {
    setNames(prev => ({ ...prev, [locale]: value }));
    updateFromTitle(locale, value);
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

            if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to create author');
        return;
      }

      const data = await res.json();
      onCreated(data.author);

    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlineCreationFields
      title="New Author"
      fieldLabel="Name"
      fieldPlaceholder="Author name"
      slugPlaceholder="author-slug"
      submitLabel="Create Author"
      values={names}
      slug={slug}
      error={error}
      saving={saving}
      onValueChange={handleNameChange}
      onSlugChange={setManualSlug}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
