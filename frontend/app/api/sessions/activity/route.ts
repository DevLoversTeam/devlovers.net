import { randomUUID } from 'crypto';
import { gte, lt, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { activeSessions } from '@/db/schema/sessions';

const SESSION_TIMEOUT_MINUTES = 15;

export async function POST() {
  try {
    const cookieStore = await cookies();
    let sessionId = cookieStore.get('user_session_id')?.value;

    if (!sessionId) {
      sessionId = randomUUID();
    }

    await db
      .insert(activeSessions)
      .values({
        sessionId,
        lastActivity: new Date(),
      })
      .onConflictDoUpdate({
        target: activeSessions.sessionId,
        set: { lastActivity: new Date() },
      });

    if (Math.random() < 0.05) {
      const cleanupThreshold = new Date(
        Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000
      );

      db.delete(activeSessions)
        .where(lt(activeSessions.lastActivity, cleanupThreshold))
        .catch(err => console.error('Cleanup error:', err));
    }

    const countThreshold = new Date(
      Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000
    );

    const result = await db
      .select({
        total: sql<number>`count(distinct session_id)`,
      })
      .from(activeSessions)
      .where(gte(activeSessions.lastActivity, countThreshold));

    const response = NextResponse.json({
      online: Number(result[0]?.total || 0),
    });

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
