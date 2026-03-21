'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AdminBlogCategoryListItem } from '@/db/queries/blog/admin-blog';
import { slugify } from '@/lib/shop/slug';
import { cn } from '@/lib/utils';

const LOCALES = ['en', 'uk', 'pl'] as const;
type Locale = (typeof LOCALES)[number];

const inputClass =
  'border-border bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm';

interface BlogCategoryManagerProps {
  categories: AdminBlogCategoryListItem[];
  csrfTokenCreate: string;
  csrfTokenUpdate: string;
  csrfTokenDelete: string;
  csrfTokenReorder: string;
}

export function BlogCategoryManager({
  categories,
  csrfTokenCreate,
  csrfTokenUpdate,
  csrfTokenDelete,
  csrfTokenReorder,
}: BlogCategoryManagerProps) {
  const router = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // ── Create form state ──────────────────────────────────────────

  const [createSlug, setCreateSlug] = useState('');
  const [createSlugTouched, setCreateSlugTouched] = useState(false);
  const [createTitles, setCreateTitles] = useState({ en: '', uk: '', pl: '' });
  const [createDescs, setCreateDescs] = useState({ en: '', uk: '', pl: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  function handleCreateTitleChange(locale: Locale, value: string) {
    setCreateTitles(prev => ({ ...prev, [locale]: value }));
    if (locale === 'en' && !createSlugTouched) {
      setCreateSlug(slugify(value));
    }
  }

  async function handleCreate() {
    setCreateError('');
    if (!createTitles.en.trim() || !createTitles.uk.trim() || !createTitles.pl.trim()) {
      setCreateError('All 3 locale titles are required');
      return;
    }
    if (!createSlug.trim()) {
      setCreateError('Slug is required');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/blog/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenCreate,
        },
        body: JSON.stringify({
          slug: createSlug.trim(),
          translations: Object.fromEntries(
            LOCALES.map(l => [l, {
              title: createTitles[l].trim(),
              description: createDescs[l].trim() || undefined,
            }])
          ),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error ?? 'Failed to create category');
        return;
      }

      setShowCreate(false);
      setCreateSlug('');
      setCreateSlugTouched(false);
      setCreateTitles({ en: '', uk: '', pl: '' });
      setCreateDescs({ en: '', uk: '', pl: '' });
      router.refresh();
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(false);
    }
  }

  // ── Edit form state ────────────────────────────────────────────

  const [editSlug, setEditSlug] = useState('');
  const [editTitles, setEditTitles] = useState({ en: '', uk: '', pl: '' });
  const [editDescs, setEditDescs] = useState({ en: '', uk: '', pl: '' });
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(cat: AdminBlogCategoryListItem) {
    setEditingId(cat.id);
    setEditSlug(cat.slug);
    setEditTitles({
      en: cat.translations.en?.title ?? '',
      uk: cat.translations.uk?.title ?? '',
      pl: cat.translations.pl?.title ?? '',
    });
    setEditDescs({
      en: cat.translations.en?.description ?? '',
      uk: cat.translations.uk?.description ?? '',
      pl: cat.translations.pl?.description ?? '',
    });
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function handleUpdate() {
    setEditError('');
    if (!editTitles.en.trim() || !editTitles.uk.trim() || !editTitles.pl.trim()) {
      setEditError('All 3 locale titles are required');
      return;
    }
    if (!editSlug.trim()) {
      setEditError('Slug is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/blog/categories/${editingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenUpdate,
        },
        body: JSON.stringify({
          slug: editSlug.trim(),
          translations: Object.fromEntries(
            LOCALES.map(l => [l, {
              title: editTitles[l].trim(),
              description: editDescs[l].trim() || undefined,
            }])
          ),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error ?? 'Failed to update category');
        return;
      }

      setEditingId(null);
      router.refresh();
    } catch {
      setEditError('Network error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────

  async function handleDelete(categoryId: string) {
    if (!confirm('Delete this category?')) return;

    setDeletingId(categoryId);
    try {
      const res = await fetch(`/api/admin/blog/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfTokenDelete },
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.code === 'HAS_POSTS'
            ? 'Category has posts assigned. Remove them first.'
            : 'Failed to delete category'
        );
      }
    } finally {
      setDeletingId(null);
    }
  }

  // ── Reorder ────────────────────────────────────────────────────

  async function handleSwap(id1: string, id2: string) {
    setReorderingId(id1);
    try {
      const res = await fetch('/api/admin/blog/categories/reorder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfTokenReorder,
        },
        body: JSON.stringify({ id1, id2 }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error('Failed to reorder');
      }
    } finally {
      setReorderingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage blog categories and display order
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          {showCreate ? 'Cancel' : '+ New Category'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border-border bg-muted/30 mt-6 space-y-3 rounded-lg border p-4">
          <p className="text-foreground text-sm font-medium">New Category</p>

          <div>
            <label className="text-muted-foreground mb-1 block text-xs">Slug</label>
            <input
              type="text"
              value={createSlug}
              onChange={e => {
                setCreateSlug(e.target.value);
                setCreateSlugTouched(true);
              }}
              className={`${inputClass} max-w-xs`}
              placeholder="category-slug"
            />
          </div>

          {LOCALES.map(locale => (
            <div key={locale} className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Title ({locale.toUpperCase()}) *
                </label>
                <input
                  type="text"
                  value={createTitles[locale]}
                  onChange={e => handleCreateTitleChange(locale, e.target.value)}
                  className={inputClass}
                  placeholder={`Title (${locale})`}
                />
              </div>
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Description ({locale.toUpperCase()})
                </label>
                <input
                  type="text"
                  value={createDescs[locale]}
                  onChange={e => setCreateDescs(prev => ({ ...prev, [locale]: e.target.value }))}
                  className={inputClass}
                  placeholder={`Description (${locale})`}
                />
              </div>
            </div>
          ))}

          {createError && <p className="text-xs text-red-500">{createError}</p>}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Category'}
          </button>
        </div>
      )}

      {/* Category list */}
      <div className="mt-6 space-y-2">
        {categories.length === 0 && (
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No categories found. Create one to get started.
          </div>
        )}

        {categories.map((cat, idx) => {
          const isEditing = editingId === cat.id;

          return (
            <div
              key={cat.id}
              className="border-border bg-background rounded-lg border"
            >
              {/* Row summary */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Reorder buttons */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => handleSwap(cat.id, categories[idx - 1].id)}
                    disabled={idx === 0 || reorderingId !== null}
                    className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwap(cat.id, categories[idx + 1].id)}
                    disabled={idx === categories.length - 1 || reorderingId !== null}
                    className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="text-foreground text-sm font-medium">
                    {cat.title}
                  </div>
                  {cat.description && (
                    <div className="text-muted-foreground truncate text-xs">
                      {cat.description}
                    </div>
                  )}
                </div>

                {/* Post count */}
                <span className="text-muted-foreground shrink-0 text-xs">
                  {cat.postCount} {cat.postCount === 1 ? 'post' : 'posts'}
                </span>

                {/* Actions */}
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => isEditing ? cancelEdit() : startEdit(cat)}
                    className="border-border text-foreground hover:bg-secondary inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors"
                  >
                    {isEditing ? 'Cancel' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(cat.id)}
                    disabled={cat.postCount > 0 || deletingId === cat.id}
                    title={cat.postCount > 0 ? `Category has ${cat.postCount} posts` : 'Delete category'}
                    className={cn(
                      'inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                      cat.postCount > 0
                        ? 'cursor-not-allowed border-red-500/10 text-red-500/40'
                        : 'border-red-500/30 text-red-500 enabled:hover:bg-red-500/10 disabled:opacity-50'
                    )}
                  >
                    {deletingId === cat.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <div className="border-border border-t px-4 py-3 space-y-3">
                  <div>
                    <label className="text-muted-foreground mb-1 block text-xs">Slug</label>
                    <input
                      type="text"
                      value={editSlug}
                      onChange={e => setEditSlug(e.target.value)}
                      className={`${inputClass} max-w-xs`}
                    />
                  </div>

                  {LOCALES.map(locale => (
                    <div key={locale} className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-muted-foreground mb-1 block text-xs">
                          Title ({locale.toUpperCase()}) *
                        </label>
                        <input
                          type="text"
                          value={editTitles[locale]}
                          onChange={e => setEditTitles(prev => ({ ...prev, [locale]: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-muted-foreground mb-1 block text-xs">
                          Description ({locale.toUpperCase()})
                        </label>
                        <input
                          type="text"
                          value={editDescs[locale]}
                          onChange={e => setEditDescs(prev => ({ ...prev, [locale]: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  ))}

                  {editError && <p className="text-xs text-red-500">{editError}</p>}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={saving}
                      className="bg-foreground text-background hover:bg-foreground/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-muted-foreground hover:text-foreground text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
