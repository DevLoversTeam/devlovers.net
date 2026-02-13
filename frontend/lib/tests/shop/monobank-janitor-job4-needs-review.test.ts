import crypto from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents } from '@/db/schema';
import { runMonobankJanitorJob4 } from '@/lib/services/orders/monobank-janitor';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logInfo: () => {},
    logWarn: () => {},
    logError: () => {},
  };
});

const EVENT_KEY_PREFIX = `test:mono-job4-needs-review:${crypto.randomUUID()}`;

function makeArgs(
  override?: Partial<Parameters<typeof runMonobankJanitorJob4>[0]>
) {
  return {
    dryRun: false,
    limit: 50,
    requestId: `req-${crypto.randomUUID()}`,
    runId: crypto.randomUUID(),
    baseMeta: {
      route: '/api/shop/internal/monobank/janitor',
      method: 'POST',
      jobName: 'monobank-janitor',
    },
    ...override,
  };
}

async function insertNeedsReviewEvent(args: {
  receivedAt: Date;
  appliedErrorCode?: string | null;
}) {
  const token = crypto.randomUUID();
  await db.insert(monobankEvents).values({
    provider: 'monobank',
    eventKey: `${EVENT_KEY_PREFIX}:event:${token}`,
    rawSha256: `${EVENT_KEY_PREFIX}:sha:${token}`,
    status: 'needs_review',
    receivedAt: args.receivedAt,
    appliedErrorCode: args.appliedErrorCode ?? null,
  });
}

describe.sequential('monobank janitor job4 needs_review report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MONO_JANITOR_JOB4_NEEDS_REVIEW_AGE_HOURS', '24');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.execute(sql`
      delete from monobank_events
      where event_key like ${`${EVENT_KEY_PREFIX}:%`}
         or raw_sha256 like ${`${EVENT_KEY_PREFIX}:%`}
    `);
  });

  it('reports only rows older than threshold and exposes stable report shape', async () => {
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      appliedErrorCode: 'MISSING_REFERENCE',
    });
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      appliedErrorCode: 'INVALID_AMOUNT',
    });
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      appliedErrorCode: 'SHOULD_BE_EXCLUDED',
    });

    const res = await runMonobankJanitorJob4(makeArgs({ limit: 10 }));

    expect(res.processed).toBe(0);
    expect(res.applied).toBe(0);
    expect(res.noop).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.report.count).toBe(2);
    expect(res.report.oldestAgeMinutes).not.toBeNull();
    expect(res.report.oldestAgeMinutes!).toBeGreaterThan(24 * 60);
    expect(res.report.topReasons).toEqual([
      { reason: 'INVALID_AMOUNT', count: 1 },
      { reason: 'MISSING_REFERENCE', count: 1 },
    ]);
  });

  it('uses slice count definition and respects limit', async () => {
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 50 * 60 * 60 * 1000),
      appliedErrorCode: 'REASON_A',
    });
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 40 * 60 * 60 * 1000),
      appliedErrorCode: 'REASON_A',
    });
    await insertNeedsReviewEvent({
      receivedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
      appliedErrorCode: 'REASON_B',
    });

    const res = await runMonobankJanitorJob4(makeArgs({ limit: 2 }));

    expect(res.report.count).toBe(2);
    expect(res.report.topReasons).toEqual([{ reason: 'REASON_A', count: 2 }]);
  });
});
