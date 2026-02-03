import { Redis } from '@upstash/redis';

import { getServerEnv } from '@/lib/env';

let cachedRedis: Redis | null = null;

export function getRedisClient() {
  if (cachedRedis) return cachedRedis;

  const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = getServerEnv();
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }

  cachedRedis = new Redis({
    url: UPSTASH_REDIS_REST_URL,
    token: UPSTASH_REDIS_REST_TOKEN,
  });

  return cachedRedis;
}
