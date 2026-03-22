import { randomUUID } from 'crypto';
import { gte, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { activeSessions } from '@/db/schema/sessions';
import { getRedisClient } from '@/lib/redis';

const SESSION_TIMEOUT_MINUTES = 15;
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;
const REDIS_KEY = 'online_sessions';

function getHeartbeatThrottleMs(): number {
  const raw = process.env.HEARTBEAT_THROTTLE_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const fallback = 60_000;
  const floor = 1_000;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(floor, parsed);
}

async function heartbeatViaRedis(sessionId: string): Promise<number | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const now = Date.now();
    const pipeline = redis.pipeline();
    pipeline.zadd(REDIS_KEY, { score: now, member: sessionId });
    pipeline.zremrangebyscore(REDIS_KEY, '-inf', now - SESSION_TIMEOUT_MS);
    pipeline.zcard(REDIS_KEY);

    const results = await pipeline.exec();
    return results[2] as number;
  } catch (err) {
    console.warn('Redis heartbeat failed, falling back to DB:', err);
    return null;
  }
}

async function heartbeatViaDb(sessionId: string): Promise<number> {
  const now = new Date();
  const heartbeatThreshold = new Date(
    now.getTime() - getHeartbeatThrottleMs()
  );

  await db
    .insert(activeSessions)
    .values({ sessionId, lastActivity: now })
    .onConflictDoUpdate({
      target: activeSessions.sessionId,
      set: { lastActivity: now },
      setWhere: lt(activeSessions.lastActivity, heartbeatThreshold),
    });

  if (Math.random() < 0.05) {
    const cleanupThreshold = new Date(Date.now() - SESSION_TIMEOUT_MS);
    db.delete(activeSessions)
      .where(lt(activeSessions.lastActivity, cleanupThreshold))
      .catch(err => console.error('Cleanup error:', err));
  }

  const countThreshold = new Date(Date.now() - SESSION_TIMEOUT_MS);
  const result = await db
    .select({ total: sql<number>`count(*)` })
    .from(activeSessions)
    .where(gte(activeSessions.lastActivity, countThreshold));

  return Number(result[0]?.total || 0);
}


export async function POST() {
   try {
    const cookieStore = await cookies();
    let sessionId = cookieStore.get('user_session_id')?.value;

    if (!sessionId) {
      sessionId = randomUUID();
    }

    const redisCount = await heartbeatViaRedis(sessionId);
    const online = redisCount ?? (await heartbeatViaDb(sessionId));

    const response = NextResponse.json({ online });

    response.cookies.set('user_session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    console.error('Join error:', error);
    return NextResponse.json({ online: 0 }, { status: 200 });
  }
}
