'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
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

export function BlogHeaderSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [items, setItems] = useState<PostSearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || items.length || isLoading) return;
    let active = true;
    setIsLoading(true);
    fetch(SEARCH_ENDPOINT, { cache: 'no-store' })
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
      router.replace(query ? `/blog?search=${encodeURIComponent(query)}` : '/blog');
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, router, value]);

  const results = useMemo<SearchResult[]>(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    const words = query.split(/\s+/).filter(Boolean);
    return items
      .filter(item => {
        const title = (item.title || '').toLowerCase();
        const bodyText = (item.body || [])
          .filter(block => block?._type === 'block')
          .map(block =>
            (block.children || []).map(child => child.text || '').join(' ')
          )
          .join(' ')
          .toLowerCase();
        return words.every(
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

  const clear = () => {
    setValue('');
    setOpen(false);
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Search blog"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id="wrap"
          className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
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
                if (!open) setOpen(true);
              }}
                onKeyDown={event => {
                  if (event.key === 'Escape') setOpen(false);
                }}
              placeholder="What're we looking for ?"
              className="w-full bg-transparent text-sm text-foreground outline-none"
              style={{ fontFamily: 'Lato, system-ui, -apple-system, sans-serif' }}
            />
            <input
              id="search_submit"
              value=""
              type="submit"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            />
          </form>
          {value && results.length > 0 && (
            <div className="max-h-56 overflow-auto border-t border-border py-2">
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
                  className="block w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <div className="font-medium text-foreground">
                    {result.title}
                  </div>
                  {result.snippet && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {result.snippet}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          {value && !results.length && !isLoading && (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  );
}
