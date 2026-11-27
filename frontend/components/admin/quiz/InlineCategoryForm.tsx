'use client';

import { useState } from 'react';

import { InlineCreationFields } from '@/components/admin/InlineCreationFields';
import { useAutoSlug } from '@/components/admin/useAutoSlug';
import type { Locale } from '@/i18n/config';

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
    <InlineCreationFields
      title="New Category"
      fieldLabel="Title"
      fieldPlaceholder="Category title"
      slugPlaceholder="category-slug"
      submitLabel="Create Category"
      values={titles}
      slug={slug}
      error={error}
      saving={saving}
      onValueChange={handleTitleChange}
      onSlugChange={setManualSlug}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}
