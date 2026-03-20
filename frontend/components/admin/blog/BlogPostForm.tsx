'use client';

import type { JSONContent } from '@tiptap/core';
import { useRef,useState } from 'react';

import type {
  AdminBlogAuthorOption,
  AdminBlogCategoryOption,
  AdminBlogPostFull,
} from '@/db/queries/blog/admin-blog';
import { useRouter } from '@/i18n/routing';
import { slugify } from '@/lib/shop/slug';

import { type AdminLocale, LocaleTabs } from '../quiz/LocaleTabs';
import { BlogImageUpload } from './BlogImageUpload';
import { BlogPublishControls, type PublishMode } from './BlogPublishControls';
import { BlogTiptapEditor } from './BlogTiptapEditor';
import { InlineBlogAuthorForm } from './InlineBlogAuthorForm';
import { InlineBlogCategoryForm } from './InlineBlogCategoryForm';

const LOCALES: AdminLocale[] = ['en', 'uk', 'pl'];

interface BlogTranslation {
  title: string;
  body: JSONContent | null;
}

const emptyTranslations = (): Record<AdminLocale, BlogTranslation> => ({
  en: { title: '', body: null },
  uk: { title: '', body: null },
  pl: { title: '', body: null },
});

interface BlogPostFormProps {
  authors: AdminBlogAuthorOption[];
  categories: AdminBlogCategoryOption[];
  csrfTokenPost: string;
  csrfTokenCategory: string;
  csrfTokenAuthor: string;
  csrfTokenImage: string;
  postId?: string;
  initialData?: AdminBlogPostFull;
}

export function BlogPostForm({
 authors: initialAuthors,
  categories: initialCategories,
  csrfTokenPost,
  csrfTokenCategory,
  csrfTokenAuthor,
  csrfTokenImage,
  postId,
  initialData,
}: BlogPostFormProps) {
  const router = useRouter();
  const isEditMode = !!initialData;

  const [activeLocale, setActiveLocale] = useState<AdminLocale>('en');
  const [translations, setTranslations] = useState(() => {
    if (!initialData) return emptyTranslations();
    const t = initialData.translations;
    return {
      en: { title: t.en?.title ?? '', body: (t.en?.body as JSONContent) ?? null },
      uk: { title: t.uk?.title ?? '', body: (t.uk?.body as JSONContent) ?? null },
      pl: { title: t.pl?.title ?? '', body: (t.pl?.body as JSONContent) ?? null },
    };
  });

  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!initialData);

  const [authors, setAuthors] = useState(initialAuthors);
  const [authorId, setAuthorId] = useState(initialData?.authorId ?? '');
  const [showNewAuthor, setShowNewAuthor] = useState(false);

  const [categories, setCategories] = useState(initialCategories);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    initialData?.categoryIds ?? []
  );
  const [showNewCategory, setShowNewCategory] = useState(false);

  const [mainImage, setMainImage] = useState<{
    url: string;
    publicId: string;
  } | null>(
    initialData?.mainImageUrl
      ? { url: initialData.mainImageUrl, publicId: initialData.mainImagePublicId ?? '' }
      : null
  );

  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(', ') ?? '');
  const [resourceLink, setResourceLink] = useState(initialData?.resourceLink ?? '');

  const [publishMode, setPublishMode] = useState<PublishMode>(() => {
    if (!initialData || !initialData.isPublished) return 'draft';
    if (initialData.scheduledPublishAt) return 'schedule';
    return 'publish';
  });
  const [scheduledDate, setScheduledDate] = useState(() => {
    if (!initialData?.scheduledPublishAt) return '';
    return new Date(initialData.scheduledPublishAt).toISOString().slice(0, 16);
  });

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dirty tracking (edit mode only)
  const initialSnapshot = useRef(() => {
    if (!initialData) return null;
    return JSON.stringify({
      translations: Object.fromEntries(
        LOCALES.map(l => [
          l,
          {
            title: initialData.translations[l]?.title ?? '',
            body: initialData.translations[l]?.body ?? null,
          },
        ])
      ),
      slug: initialData.slug,
      authorId: initialData.authorId ?? '',
      categoryIds: [...(initialData.categoryIds ?? [])].sort(),
      mainImageUrl: initialData.mainImageUrl ?? null,
      tagsInput: initialData.tags?.join(', ') ?? '',
      resourceLink: initialData.resourceLink ?? '',
      publishMode: !initialData.isPublished
        ? 'draft'
        : initialData.scheduledPublishAt
          ? 'schedule'
          : 'publish',
      scheduledDate: initialData.scheduledPublishAt
        ? new Date(initialData.scheduledPublishAt).toISOString().slice(0, 16)
        : '',
    });
  });

  function isDirty(): boolean {
    if (!isEditMode) return true;
    const snap = initialSnapshot.current();
    if (!snap) return true;
    const current = JSON.stringify({
      translations: Object.fromEntries(
        LOCALES.map(l => [
          l,
          {
            title: translations[l].title,
            body: translations[l].body,
          },
        ])
      ),
      slug,
      authorId,
      categoryIds: [...selectedCategoryIds].sort(),
      mainImageUrl: mainImage?.url ?? null,
      tagsInput,
      resourceLink,
      publishMode,
      scheduledDate,
    });
    return current !== snap;
  }

  function handleTitleChange(value: string) {
    setTranslations(prev => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], title: value },
    }));

    if (activeLocale === 'en' && !slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleBodyChange(locale: AdminLocale, json: JSONContent) {
    setTranslations(prev => ({
      ...prev,
      [locale]: { ...prev[locale], body: json },
    }));
  }

  function handleCategoryToggle(categoryId: string) {
    setSelectedCategoryIds(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  }

  function handleCategoryCreated(cat: {
    id: string;
    slug: string;
    title: string;
  }) {
    setCategories(prev => [...prev, cat]);
    setSelectedCategoryIds(prev => [...prev, cat.id]);
    setShowNewCategory(false);
  }

  function handleAuthorCreated(author: { id: string; name: string }) {
    setAuthors(prev => [...prev, author]);
    setAuthorId(author.id);
    setShowNewAuthor(false);
  }

  function getMissingTitles() {
  return LOCALES.filter(l => !translations[l].title.trim());
}

  function getMissingBodies() {
  return LOCALES.filter(l => {
    const body = translations[l].body;
    if (!body) return true;
    const content = body.content;
    if (!content || content.length === 0) return true;
    if (
      content.length === 1 &&
      content[0].type === 'paragraph' &&
      (!content[0].content || content[0].content.length === 0)
    )
      return true;
    return false;
  });
}

  function isFormValid() {
    if (getMissingTitles().length > 0) return false;
    if (getMissingBodies().length > 0) return false;
    if (!slug.trim()) return false;
    if (publishMode === 'schedule' && !scheduledDate) return false;
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

   const missingTitles = getMissingTitles();
    if (missingTitles.length > 0) {
      setError(
        `Title required for: ${missingTitles.map(l => l.toUpperCase()).join(', ')}`
      );
      return;
    }

    const missingBodies = getMissingBodies();
    if (missingBodies.length > 0) {
      setError(
        `Body required for: ${missingBodies.map(l => l.toUpperCase()).join(', ')}`
      );
      return;
    }

    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }
    if (publishMode === 'schedule' && !scheduledDate) {
      setError('Scheduled date is required');
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const body = {
        slug: slug.trim(),
        authorId: authorId || null,
        mainImageUrl: mainImage?.url ?? null,
        mainImagePublicId: mainImage?.publicId ?? null,
        tags,
        resourceLink: resourceLink.trim() || null,
        translations: {
          en: {
            title: translations.en.title.trim(),
            body: translations.en.body,
          },
          uk: {
            title: translations.uk.title.trim(),
            body: translations.uk.body,
        },
          pl: {
            title: translations.pl.title.trim(),
            body: translations.pl.body,
        },
        },
        categoryIds: selectedCategoryIds,
        publishMode,
        scheduledPublishAt:
          publishMode === 'schedule' ? scheduledDate : null,
      };

      const url = isEditMode ? `/api/admin/blog/${postId}` : '/api/admin/blog';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenPost,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? (isEditMode ? 'Failed to update post' : 'Failed to create post'));
        return;
      }

      router.push('/admin/blog');
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title + Locale tabs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-foreground text-sm font-medium">Title</label>
          <LocaleTabs active={activeLocale} onChange={setActiveLocale} />
        </div>
        <input
          type="text"
          value={translations[activeLocale].title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder={`Post title (${activeLocale.toUpperCase()})`}
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
          placeholder="post-slug"
          className="border-border bg-background text-foreground w-full max-w-sm rounded-md border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Auto-generated from EN title. Edit manually if needed.
        </p>
      </div>

      {/* Author */}
      <div className="space-y-2">
        <label className="text-foreground text-sm font-medium">Author</label>
        <div className="flex items-center gap-3">
          <select
            value={authorId}
            onChange={e => setAuthorId(e.target.value)}
            className="border-border bg-background text-foreground rounded-md border px-3 py-2 text-sm"
          >
            <option value="">No author</option>
            {authors.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewAuthor(!showNewAuthor)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {showNewAuthor ? 'Cancel' : '+ New Author'}
          </button>
        </div>

        {showNewAuthor && (
          <InlineBlogAuthorForm
            csrfToken={csrfTokenAuthor}
            onCreated={handleAuthorCreated}
            onCancel={() => setShowNewAuthor(false)}
          />
        )}
      </div>

      {/* Categories */}
      <div className="space-y-2">
        <label className="text-foreground text-sm font-medium">
          Categories
        </label>
        <div className="flex flex-wrap gap-3">
          {categories.map(cat => (
            <label key={cat.id} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={selectedCategoryIds.includes(cat.id)}
                onChange={() => handleCategoryToggle(cat.id)}
                className="accent-[var(--accent-primary)]"
              />
              <span className="text-foreground">{cat.title}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={() => setShowNewCategory(!showNewCategory)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {showNewCategory ? 'Cancel' : '+ New Category'}
          </button>
        </div>

        {showNewCategory && (
          <InlineBlogCategoryForm
            csrfToken={csrfTokenCategory}
            onCreated={handleCategoryCreated}
            onCancel={() => setShowNewCategory(false)}
          />
        )}
      </div>

      {/* Main image */}
      <div className="space-y-2">
        <label className="text-foreground text-sm font-medium">
          Main Image
        </label>
        <BlogImageUpload
          csrfToken={csrfTokenImage}
          initialUrl={mainImage?.url}
          onChange={setMainImage}
        />
      </div>

      {/* Body editor (per locale, only active visible) */}
      <div className="space-y-2">
        <label className="text-foreground text-sm font-medium">
          Body ({activeLocale.toUpperCase()})
        </label>
        {LOCALES.map(locale => (
          <div
            key={locale}
            className={locale === activeLocale ? '' : 'hidden'}
          >
            <BlogTiptapEditor
              content={translations[locale].body}
              onChange={json => handleBodyChange(locale, json)}
              csrfToken={csrfTokenImage}
            />
          </div>
        ))}
      </div>

      {/* Tags */}
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">
          Tags
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="react, nextjs, typescript (comma-separated)"
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* Resource link */}
      <div>
        <label className="text-foreground mb-1 block text-sm font-medium">
          Resource Link
        </label>
        <input
          type="url"
          value={resourceLink}
          onChange={e => setResourceLink(e.target.value)}
          placeholder="https://..."
          className="border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <BlogPublishControls
        mode={publishMode}
        scheduledDate={scheduledDate}
        onModeChange={setPublishMode}
        onScheduledDateChange={setScheduledDate}
        currentStatus={
          initialData
            ? initialData.isPublished
              ? initialData.scheduledPublishAt
                ? 'scheduled'
                : 'published'
              : 'draft'
            : undefined
        }
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !isFormValid() || (isEditMode && !isDirty())}
         className="bg-foreground text-background rounded-md px-6 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:bg-foreground/90"
      >
          {submitting
          ? isEditMode ? 'Updating...' : 'Creating...'
          : isEditMode ? 'Update Post' : 'Create Post'}
      </button>
    </form>
  );
}
