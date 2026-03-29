import { Redis } from '@upstash/redis';

import { readServerEnv } from '@/lib/env/server-env';

let cachedRedis: Redis | null = null;

export function getRedisClient() {
  if (cachedRedis) return cachedRedis;

  const UPSTASH_REDIS_REST_URL = readServerEnv('UPSTASH_REDIS_REST_URL');
  const UPSTASH_REDIS_REST_TOKEN = readServerEnv('UPSTASH_REDIS_REST_TOKEN');

  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  try {
    new URL(UPSTASH_REDIS_REST_URL);
  } catch {
    return null;
  }

  cachedRedis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  });

  return cachedRedis;
}
