'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from '@/i18n/routing';

type PostSearchItem = {
  _id: string;
  title?: string;
  body?: Array<{ _type: string; children?: Array<{ text?: string }> }>;
  slug?: { current?: string };
};

type SearchResult = PostSearchItem & { snippet?: string };

function extractSnippet(body: PostSearchItem['body'], query: string) {
  const text = (body || [])
    .filter(block => block?._type === 'block')
    .map(block =>
      (block.children || []).map(child => child.text || '').join(' ')
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 90);
  const start = Math.max(0, idx - 36);
  const end = Math.min(text.length, idx + 54);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

const SEARCH_ENDPOINT = '/api/blog-search';

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function BlogHeaderSearch() {
  const t = useTranslations('blog');
  const tAria = useTranslations('aria');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [items, setItems] = useState<PostSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || items.length || !isLoading) return;
    let active = true;
    fetch(`${SEARCH_ENDPOINT}?locale=${encodeURIComponent(locale)}`, {
      cache: 'no-store',
    })
      .then(response => (response.ok ? response.json() : []))
      .then((result: PostSearchItem[]) => {
        if (!active) return;
        setItems(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, items.length, isLoading]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const query = value.trim();
      router.replace(
        query ? `/blog?search=${encodeURIComponent(query)}` : '/blog'
      );
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, router, value]);

  const results = useMemo<SearchResult[]>(() => {
    const query = normalizeSearchText(value);
    if (!query) return [];
    const words = query.split(/\s+/).filter(Boolean);
    return items
      .filter(item => {
        const title = normalizeSearchText(item.title || '');
        const bodyText = normalizeSearchText(
          (item.body || [])
            .filter(block => block?._type === 'block')
            .map(block =>
              (block.children || []).map(child => child.text || '').join(' ')
            )
            .join(' ')
        );
        return words.some(
          word => title.includes(word) || bodyText.includes(word)
        );
      })
      .slice(0, 6)
      .map(item => ({
        ...item,
        snippet: extractSnippet(item.body, query),
      }));
  }, [items, value]);

  const submit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const query = value.trim();
    router.push(query ? `/blog?search=${encodeURIComponent(query)}` : '/blog');
    setOpen(false);
  };

  const startLoading = () => {
    if (!items.length && !isLoading) {
      setIsLoading(true);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() =>
          setOpen(prev => {
            const next = !prev;
            if (next) startLoading();
            return next;
          })
        }
        className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        aria-label={tAria('searchBlog')}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="wrap"
          className="border-border bg-background absolute top-12 right-0 z-50 w-72 overflow-hidden rounded-lg border shadow-lg"
        >
          <form
            action=""
            autoComplete="on"
            onSubmit={submit}
            className="flex items-center gap-2 px-3 py-2"
          >
            <input
              ref={inputRef}
              id="search"
              name="search"
              type="text"
              value={value}
              onChange={event => {
                setValue(event.target.value);
                if (!open) {
                  setOpen(true);
                  startLoading();
                }
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') setOpen(false);
              }}
              placeholder={t('searchPlaceholder')}
              className="text-foreground w-full bg-transparent text-sm outline-none"
              style={{
                fontFamily: 'Lato, system-ui, -apple-system, sans-serif',
              }}
            />
            <input
              id="search_submit"
              value=""
              type="submit"
              className="text-muted-foreground hover:text-foreground text-sm font-medium"
            />
          </form>
          {value && results.length > 0 && (
            <div className="border-border max-h-56 overflow-auto border-t py-2">
              {results.map(result => (
                <button
                  key={result._id}
                  type="button"
                  onClick={() => {
                    const slug = result.slug?.current;
                    if (slug) {
                      router.push(`/blog/${slug}`);
                    } else {
                      router.push(
                        `/blog?search=${encodeURIComponent(result.title || '')}`
                      );
                    }
                    setOpen(false);
                  }}
                  className="text-muted-foreground hover:bg-secondary hover:text-foreground block w-full px-3 py-2 text-left text-sm"
                >
                  <div className="text-foreground font-medium">
                    {result.title}
                  </div>
                  {result.snippet && (
                    <div className="text-muted-foreground mt-1 text-xs">
                      {result.snippet}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {value && !results.length && !isLoading && (
            <div className="border-border text-muted-foreground border-t px-3 py-2 text-xs">
              {t('noMatches')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
