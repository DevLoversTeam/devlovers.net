'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AdminCategoryItem } from '@/db/queries/categories/admin-categories';
import { slugify } from '@/lib/shop/slug';
import type { JsonQuestion } from '@/lib/validation/admin-quiz';

import { InlineCategoryForm } from './InlineCategoryForm';
import { JsonUploadArea } from './JsonUploadArea';
import { type AdminLocale, LocaleTabs } from './LocaleTabs';

const LOCALES: AdminLocale[] = ['en', 'uk', 'pl'];

const emptyTranslations = () => ({
  en: { title: '', description: '' },
  uk: { title: '', description: '' },
  pl: { title: '', description: '' },
});

interface CreateQuizFormProps {
  categories: AdminCategoryItem[];
  csrfTokenQuiz: string;
  csrfTokenCategory: string;
}

export function CreateQuizForm({
  categories: initialCategories,
  csrfTokenQuiz,
  csrfTokenCategory,
}: CreateQuizFormProps) {
  const router = useRouter();

  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('');

  const [translations, setTranslations] = useState(emptyTranslations);
  const [activeLocale, setActiveLocale] = useState<AdminLocale>('en');

  const [questions, setQuestions] = useState<JsonQuestion[]>([]);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleTranslationChange(
    field: 'title' | 'description',
    value: string
  ) {
    setTranslations(prev => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], [field]: value },
    }));

    if (field === 'title' && activeLocale === 'en' && !slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleCategoryCreated(cat: {
    id: string;
    slug: string;
    title: string;
  }) {
    setCategories(prev => [...prev, cat]);
    setCategoryId(cat.id);
    setShowNewCategory(false);
  }

  function getDifficultyStats() {
    const counts = { beginner: 0, medium: 0, advanced: 0 };
    for (const q of questions) {
      counts[q.difficulty]++;
    }
    return counts;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!categoryId) {
      setError('Select a category');
      return;
    }

    const missing = LOCALES.filter(
      l => !translations[l].title.trim() || !translations[l].description.trim()
    );
    if (missing.length > 0) {
      setError(
        `Title and description required for: ${missing.map(l => l.toUpperCase()).join(', ')}`
      );
      return;
    }

    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }

    if (questions.length === 0) {
      setError('Upload at least one JSON file with questions');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        categoryId,
        slug: slug.trim(),
        timeLimitSeconds: timeLimitSeconds ? Number(timeLimitSeconds) : null,
        translations: {
          en: {
            title: translations.en.title.trim(),
            description: translations.en.description.trim(),
          },
          uk: {
            title: translations.uk.title.trim(),
            description: translations.uk.description.trim(),
          },
          pl: {
            title: translations.pl.title.trim(),
            description: translations.pl.description.trim(),
          },
        },
        questions,
      };

      const res = await fetch('/api/admin/quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenQuiz,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to create quiz');
        return;
      }

      router.push(`/admin/quiz/${data.quizId}`);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const stats = getDifficultyStats();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Category */}
      <div className="space-y-2">
        <label className="text-foreground text-sm font-medium">Category</label>
        <div className="flex items-center gap-3">
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Select category...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.slug})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewCategory(!showNewCategory)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {showNewCategory ? 'Cancel' : '+ New Category'}
          </button>
        </div>

        {showNewCategory && (
          <InlineCategoryForm
            csrfToken={csrfTokenCategory}
            onCreated={handleCategoryCreated}
            onCancel={() => setShowNewCategory(false)}
          />
        )}
      </div>

      {/* Translations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-foreground text-sm font-medium">
            Title & Description
          </label>
          <LocaleTabs active={activeLocale} onChange={setActiveLocale} />
        </div>

        <input
          type="text"
          value={translations[activeLocale].title}
          onChange={e => handleTranslationChange('title', e.target.value)}
          placeholder={`Quiz title (${activeLocale.toUpperCase()})`}
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />

        <textarea
          value={translations[activeLocale].description}
          onChange={e => handleTranslationChange('description', e.target.value)}
          placeholder={`Quiz description (${activeLocale.toUpperCase()})`}
          rows={3}
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* Slug */}
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">
          Slug
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="quiz-slug"
          className="border-border bg-background text-foreground w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Auto-generated from EN title. Edit manually if needed.
        </p>
      </div>

      {/* Time Limit */}
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">
          Time Limit (seconds)
        </label>
        <input
          type="number"
          value={timeLimitSeconds}
          onChange={e => setTimeLimitSeconds(e.target.value)}
          placeholder="Optional"
          min={0}
          className="border-border bg-background text-foreground w-full max-w-[160px] rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* JSON Upload */}
      <JsonUploadArea onQuestionsChange={setQuestions} />

      {/* Questions Preview */}
      {questions.length > 0 && (
        <div className="border-border bg-muted/30 rounded-lg border p-4">
          <p className="text-foreground text-sm font-medium">
            {questions.length} questions uploaded
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Beginner: {stats.beginner} / Intermediate: {stats.medium} /
            Advanced: {stats.advanced}
          </p>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create Quiz'}
      </button>
    </form>
  );
}
