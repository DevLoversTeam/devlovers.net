import { NextResponse } from 'next/server';

import { getRedisClient } from '@/lib/redis';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 403 });
  }

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured' });
  }

  const keys = await redis.keys('quiz:answers:*');
  const data: Record<string, unknown> = {};

  for (const key of keys) {
    data[key] = await redis.get(key);
  }

  return NextResponse.json({
    count: keys.length,
    keys,
    data,
  });
}
