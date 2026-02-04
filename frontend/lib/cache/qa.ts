import { getRedisClient } from '@/lib/redis';

type QaCacheKeyInput = {
  category: string;
  locale: string;
  page: number;
  limit: number;
  search?: string | null;
};

export function buildQaCacheKey({
  category,
  locale,
  page,
  limit,
  search,
}: QaCacheKeyInput) {
  const normalizedCategory = category.toLowerCase();
  const normalizedLocale = locale.toLowerCase();
  const searchKey = search?.trim() ? search.trim().toLowerCase() : 'all';

  return `qa:category:${normalizedCategory}:locale:${normalizedLocale}:page:${page}:limit:${limit}:search:${searchKey}`;
}

export async function getQaCache<T>(key: string) {
  const redis = getRedisClient();
  if (!redis) return null;

  const cached = await redis.get<T | string>(key);
  if (!cached) return null;

  if (typeof cached !== 'string') {
    return cached as T;
  }

  try {
    return JSON.parse(cached) as T;
  } catch (error) {
    console.warn('[qa-cache] Failed to parse cached value', error);
    await redis.del(key);
    return null;
  }
}

export async function setQaCache<T>(key: string, value: T) {
  const redis = getRedisClient();
  if (!redis) return;

  await redis.set(key, value);
}

export async function invalidateQaCacheByCategory(category: string) {
  const redis = getRedisClient();
  if (!redis) return 0;

  const prefix = `qa:category:${category.toLowerCase()}:`;
  let cursor = 0;
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: `${prefix}*`,
      count: 100,
    });
    cursor = Number(nextCursor);

    if (keys.length) {
      const removed = await redis.del(...keys);
      deleted += removed ?? 0;
    }
  } while (cursor !== 0);

  return deleted;
}

export async function invalidateAllQaCache() {
  const redis = getRedisClient();
  if (!redis) return 0;

  let cursor = 0;
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: 'qa:*',
      count: 200,
    });
    cursor = Number(nextCursor);

    if (keys.length) {
      const removed = await redis.del(...keys);
      deleted += removed ?? 0;
    }
  } while (cursor !== 0);

  return deleted;
}
