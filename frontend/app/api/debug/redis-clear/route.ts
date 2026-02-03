import { NextResponse } from 'next/server';

import { getRedisClient } from '@/lib/redis';

export async function DELETE() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev only' }, { status: 403 });
  }

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json({ error: 'No Redis client' }, { status: 500 });
  }

  const keys = await redis.keys('quiz:answers:*');

  if (keys.length > 0) {
    await redis.del(...keys);
  }

  return NextResponse.json({ deleted: keys.length });
}
