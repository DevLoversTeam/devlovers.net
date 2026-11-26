'use client';

import { useState } from 'react';

import type { Locale } from '@/i18n/config';
import { slugify } from '@/lib/shop/slug';

export function useAutoSlug(initialSlug?: string) {
  const [slug, setSlug] = useState(initialSlug ?? '');
  const [autoGenerate, setAutoGenerate] = useState(initialSlug === undefined);

  function updateFromTitle(locale: Locale, title: string) {
    if (locale === 'en' && autoGenerate) {
      setSlug(slugify(title));
    }
  }

  function setManualSlug(value: string) {
    setSlug(value);
    setAutoGenerate(false);
  }

  function resetSlug() {
    setSlug(initialSlug ?? '');
    setAutoGenerate(initialSlug === undefined);
  }

  return { slug, updateFromTitle, setManualSlug, resetSlug };
}
