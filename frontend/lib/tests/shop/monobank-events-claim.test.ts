import crypto from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents } from '@/db/schema';
import { claimNextMonobankEvent } from '@/lib/services/orders/monobank-events-claim';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logDebug: () => {},
    logError: () => {},
  };
});

const EVENT_KEY_PREFIX = `test:mono-event-claim:${crypto.randomUUID()}`;

function buildEventKeys() {
  const token = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    eventKey: `${EVENT_KEY_PREFIX}:event:${token}`,
    rawSha256: `${EVENT_KEY_PREFIX}:sha:${token}`,
  };
}

async function insertMinimalEvent(args: {
  id: string;
  eventKey: string;
  rawSha256: string;
  receivedAt: Date;
  providerModifiedAt: Date;
}) {
  await db.insert(monobankEvents).values({
    id: args.id,
    provider: 'monobank',
    eventKey: args.eventKey,
    rawSha256: args.rawSha256,
    receivedAt: args.receivedAt,
    providerModifiedAt: args.providerModifiedAt,
  });
}

describe.sequential('claimNextMonobankEvent', () => {
  beforeEach(async () => {
    await db.execute(sql`
      delete from monobank_events
      where event_key like ${`${EVENT_KEY_PREFIX}:%`}
         or raw_sha256 like ${`${EVENT_KEY_PREFIX}:%`}
         or event_key = 'test:event_key:1'
         or raw_sha256 = 'test:raw_sha256:1'
    `);
  });

  afterEach(async () => {
    await db.execute(sql`
      delete from monobank_events
      where event_key like ${`${EVENT_KEY_PREFIX}:%`}
         or raw_sha256 like ${`${EVENT_KEY_PREFIX}:%`}
         or event_key = 'test:event_key:1'
         or raw_sha256 = 'test:raw_sha256:1'
    `);
  });

  it('claims first eligible event and sets lease fields', async () => {
    const keys = buildEventKeys();
    await insertMinimalEvent({
      ...keys,
      receivedAt: new Date('1900-01-01T00:00:00.000Z'),
      providerModifiedAt: new Date('1900-01-01T00:00:00.000Z'),
    });

    const claimed = await claimNextMonobankEvent('test-worker-1');
    expect(claimed).not.toBeNull();
    expect(claimed?.event_key).toBe(keys.eventKey);

    const [stored] = await db
      .select({
        claimedAt: monobankEvents.claimedAt,
        claimExpiresAt: monobankEvents.claimExpiresAt,
        claimedBy: monobankEvents.claimedBy,
      })
      .from(monobankEvents)
      .where(eq(monobankEvents.eventKey, keys.eventKey))
      .limit(1);

    expect(stored?.claimedAt).toBeTruthy();
    expect(stored?.claimExpiresAt).toBeTruthy();
    expect(stored?.claimedBy).toBe('test-worker-1');
  });

  it('second claim returns null while lease is active', async () => {
    const keys = buildEventKeys();
    await insertMinimalEvent({
      ...keys,
      receivedAt: new Date('1900-01-01T00:00:00.000Z'),
      providerModifiedAt: new Date('1900-01-01T00:00:00.000Z'),
    });

    const firstClaim = await claimNextMonobankEvent('test-worker-1');
    expect(firstClaim?.event_key).toBe(keys.eventKey);

    const secondClaim = await claimNextMonobankEvent('test-worker-2');
    expect(secondClaim).toBeNull();
  });

  it('claim returns the row again after lease expiration', async () => {
    const keys = buildEventKeys();
    await insertMinimalEvent({
      ...keys,
      receivedAt: new Date('1900-01-01T00:00:00.000Z'),
      providerModifiedAt: new Date('1900-01-01T00:00:00.000Z'),
    });

    const firstClaim = await claimNextMonobankEvent('test-worker-1');
    expect(firstClaim?.event_key).toBe(keys.eventKey);

    await db
      .update(monobankEvents)
      .set({
        claimExpiresAt: new Date(Date.now() - 1_000),
      })
      .where(eq(monobankEvents.eventKey, keys.eventKey));

    const reclaimed = await claimNextMonobankEvent('test-worker-3');
    expect(reclaimed).not.toBeNull();
    expect(reclaimed?.event_key).toBe(keys.eventKey);
    expect(reclaimed?.claimed_by).toBe('test-worker-3');
  });
});
