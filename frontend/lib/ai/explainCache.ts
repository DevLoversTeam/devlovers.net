import type { ExplanationResponse } from './prompts';

export const CACHE_KEY = 'ai-word-explanations';
const CACHE_VERSION = 1;

interface CacheEntry {
  explanation: ExplanationResponse;
  timestamp: number;
}

interface CacheData {
  version: number;
  entries: Record<string, CacheEntry>;
}

function normalizeKey(term: string): string {
  return term.toLowerCase().trim();
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function isValidCacheData(data: unknown): data is CacheData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    typeof (data as CacheData).version === 'number' &&
    'entries' in data &&
    typeof (data as CacheData).entries === 'object' &&
    (data as CacheData).entries !== null
  );
}

function getDefaultCache(): CacheData {
  return { version: CACHE_VERSION, entries: {} };
}

function readCache(): CacheData {
  if (!isBrowser()) {
    return getDefaultCache();
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return getDefaultCache();
    }

    const data: unknown = JSON.parse(raw);

    if (!isValidCacheData(data)) {
      localStorage.removeItem(CACHE_KEY);
      return getDefaultCache();
    }

    if (data.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return getDefaultCache();
    }

    return data;
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return getDefaultCache();
  }
}

function writeCache(data: CacheData): void {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to write to explanation cache:', error);
  }
}

export function getCachedExplanation(term: string): ExplanationResponse | null {
  const key = normalizeKey(term);
  const cache = readCache();
  const entry = cache.entries[key];
  if (!entry) return null;
  return entry.explanation;
}

export function setCachedExplanation(
  term: string,
  explanation: ExplanationResponse
): void {
  const key = normalizeKey(term);
  const cache = readCache();

  cache.entries[key] = {
    explanation,
    timestamp: Date.now(),
  };

  writeCache(cache);
}

export function clearCache(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(CACHE_KEY);
}

export function getCacheSize(): number {
  const cache = readCache();
  return Object.keys(cache.entries).length;
}

export function getCachedTerms(): string[] {
  const cache = readCache();
  return Object.keys(cache.entries);
}

export function hasCache(term: string): boolean {
  const key = normalizeKey(term);
  const cache = readCache();
  return key in cache.entries;
}
