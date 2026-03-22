'use client';

import { useRef, useState } from 'react';

import type { AdminBlogAuthorFull } from '@/db/queries/blog/admin-blog';
import { useRouter } from '@/i18n/routing';
import { slugify } from '@/lib/shop/slug';

import { type AdminLocale, LocaleTabs } from '../quiz/LocaleTabs';
import { BlogImageUpload } from './BlogImageUpload';

const LOCALES: AdminLocale[] = ['en', 'uk', 'pl'];

const PLATFORMS = [
  { value: 'github', label: 'GitHub' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
  { value: 'website', label: 'Website' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'behance', label: 'Behance' },
  { value: 'dribbble', label: 'Dribbble' },
] as const;

interface AuthorTranslation {
  name: string;
  bio: string;
  jobTitle: string;
  company: string;
  city: string;
}

interface SocialEntry {
  platform: string;
  url: string;
}

const emptyTranslation = (): AuthorTranslation => ({
  name: '',
  bio: '',
  jobTitle: '',
  company: '',
  city: '',
});

const emptyTranslations = (): Record<AdminLocale, AuthorTranslation> => ({
  en: emptyTranslation(),
  uk: emptyTranslation(),
  pl: emptyTranslation(),
});

interface BlogAuthorFormProps {
  initialData?: AdminBlogAuthorFull;
  csrfTokenAuthor: string;
  csrfTokenImage: string;
}

export function BlogAuthorForm({
  initialData,
  csrfTokenAuthor,
  csrfTokenImage,
}: BlogAuthorFormProps) {
  const router = useRouter();
  const isEditMode = !!initialData;

  const [activeLocale, setActiveLocale] = useState<AdminLocale>('en');
  const [translations, setTranslations] = useState<Record<AdminLocale, AuthorTranslation>>(() => {
    if (!initialData) return emptyTranslations();
    const t = initialData.translations;
    return {
      en: {
        name: t.en?.name ?? '',
        bio: t.en?.bio ?? '',
        jobTitle: t.en?.jobTitle ?? '',
        company: t.en?.company ?? '',
        city: t.en?.city ?? '',
      },
      uk: {
        name: t.uk?.name ?? '',
        bio: t.uk?.bio ?? '',
        jobTitle: t.uk?.jobTitle ?? '',
        company: t.uk?.company ?? '',
        city: t.uk?.city ?? '',
      },
      pl: {
        name: t.pl?.name ?? '',
        bio: t.pl?.bio ?? '',
        jobTitle: t.pl?.jobTitle ?? '',
        company: t.pl?.company ?? '',
        city: t.pl?.city ?? '',
      },
    };
  });

  const [slug, setSlug] = useState(initialData?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!initialData);

  const [image, setImage] = useState<{ url: string; publicId: string } | null>(
    initialData?.imageUrl
      ? { url: initialData.imageUrl, publicId: initialData.imagePublicId ?? '' }
      : null
  );

  const [socialMedia, setSocialMedia] = useState<SocialEntry[]>(
    initialData?.socialMedia ?? []
  );

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const initialSnapshot = useRef(() => {
    if (!initialData) return null;
    return JSON.stringify({
      slug: initialData.slug,
      imageUrl: initialData.imageUrl ?? null,
      socialMedia: initialData.socialMedia ?? [],
      translations: Object.fromEntries(
        LOCALES.map(l => [l, {
          name: initialData.translations[l]?.name ?? '',
          bio: initialData.translations[l]?.bio ?? '',
          jobTitle: initialData.translations[l]?.jobTitle ?? '',
          company: initialData.translations[l]?.company ?? '',
          city: initialData.translations[l]?.city ?? '',
        }])
      ),
    });
  });

  function isDirty(): boolean {
    if (!isEditMode) return true;
    const snap = initialSnapshot.current();
    if (!snap) return true;
    const current = JSON.stringify({
      slug,
      imageUrl: image?.url ?? null,
      socialMedia,
      translations: Object.fromEntries(
        LOCALES.map(l => [l, translations[l]])
      ),
    });
    return current !== snap;
  }

  function handleNameChange(value: string) {
    setTranslations(prev => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], name: value },
    }));
    if (activeLocale === 'en' && !slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleFieldChange(field: keyof AuthorTranslation, value: string) {
    setTranslations(prev => ({
      ...prev,
      [activeLocale]: { ...prev[activeLocale], [field]: value },
    }));
  }

  function addSocialEntry() {
    setSocialMedia(prev => [...prev, { platform: PLATFORMS[0].value, url: '' }]);
  }

  function removeSocialEntry(index: number) {
    setSocialMedia(prev => prev.filter((_, i) => i !== index));
  }

  function updateSocialEntry(index: number, field: keyof SocialEntry, value: string) {
    setSocialMedia(prev =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    );
  }

  function isFormValid(): boolean {
    if (!slug.trim()) return false;
    return LOCALES.every(l => translations[l].name.trim().length > 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const body = {
      slug: slug.trim(),
      imageUrl: image?.url ?? null,
      imagePublicId: image?.publicId ?? null,
      socialMedia: socialMedia.filter(s => s.url.trim()),
      translations: Object.fromEntries(
        LOCALES.map(l => [l, {
          name: translations[l].name.trim(),
          bio: translations[l].bio.trim() || undefined,
          jobTitle: translations[l].jobTitle.trim() || undefined,
          company: translations[l].company.trim() || undefined,
          city: translations[l].city.trim() || undefined,
        }])
      ),
    };

    try {
      const url = isEditMode
        ? `/api/admin/blog/authors/${initialData.id}`
        : '/api/admin/blog/authors';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenAuthor,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Failed to save author');
        return;
      }

      router.push('/admin/blog/authors');
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm';
  const labelClass = 'text-foreground mb-1 block text-sm font-medium';

  const current = translations[activeLocale];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Profile photo */}
      <div>
        <label className={labelClass}>Profile Photo</label>
        <BlogImageUpload
          csrfToken={csrfTokenImage}
          initialUrl={initialData?.imageUrl}
          onChange={setImage}
        />
      </div>

      {/* Locale tabs + translation fields */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className={labelClass}>Translations</label>
          <LocaleTabs active={activeLocale} onChange={setActiveLocale} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Name *
            </label>
            <input
              type="text"
              value={current.name}
              onChange={e => handleNameChange(e.target.value)}
              className={inputClass}
              placeholder="Author name"
            />
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Job Title
            </label>
            <input
              type="text"
              value={current.jobTitle}
              onChange={e => handleFieldChange('jobTitle', e.target.value)}
              className={inputClass}
              placeholder="e.g. Senior Developer"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                Company
              </label>
              <input
                type="text"
                value={current.company}
                onChange={e => handleFieldChange('company', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">
                City
              </label>
              <input
                type="text"
                value={current.city}
                onChange={e => handleFieldChange('city', e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs">
              Bio
            </label>
            <textarea
              value={current.bio}
              onChange={e => handleFieldChange('bio', e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Short author bio"
            />
          </div>
        </div>
      </div>

       {/* Slug */}
      <div>
        <label className={labelClass}>Slug</label>
        <input
          type="text"
          value={slug}
          onChange={e => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className={inputClass}
          placeholder="author-slug"
        />
      </div>

      {/* Social media */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className={labelClass}>Social Media</label>
          <button
            type="button"
            onClick={addSocialEntry}
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            + Add link
          </button>
        </div>

        {socialMedia.length === 0 && (
          <p className="text-muted-foreground text-xs">No social links added.</p>
        )}

        <div className="space-y-2">
          {socialMedia.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={entry.platform}
            onChange={e => updateSocialEntry(i, 'platform', e.target.value)}
            className="border-border bg-background text-foreground w-36 shrink-0 rounded-md border px-3 py-2 text-sm"
          >
            {PLATFORMS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <input
            type="url"
            value={entry.url}
            onChange={e => updateSocialEntry(i, 'url', e.target.value)}
            className="border-border bg-background text-foreground min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={() => removeSocialEntry(i)}
            className="shrink-0 text-xs text-red-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !isFormValid() || (isEditMode && !isDirty())}
          title={
            submitting
              ? 'Saving...'
              : !slug.trim()
                ? 'Slug is required'
                : !LOCALES.every(l => translations[l].name.trim())
                  ? 'Name is required in all 3 locales (EN, UK, PL)'
                  : isEditMode && !isDirty()
                    ? 'No changes to save'
                    : undefined
          }
          className="bg-foreground text-background enabled:hover:bg-foreground/90 rounded-md px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Saving...'
            : isEditMode
              ? 'Update Author'
              : 'Create Author'}
        </button>
      </div>
    </form>
  );
}
