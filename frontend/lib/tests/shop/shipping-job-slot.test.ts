import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { acquireShippingJobSlot } from '@/app/api/shop/internal/shipping/_shared';
import { POST as syncNovaPoshta } from '@/app/api/shop/internal/shipping/np/sync/route';
import { POST as runRetention } from '@/app/api/shop/internal/shipping/retention/run/route';
import { POST as runShipments } from '@/app/api/shop/internal/shipping/shipments/run/route';

const { execute, anonymizeRetainedOrderShippingSnapshots } = vi.hoisted(() => ({
  execute: vi.fn(),
  anonymizeRetainedOrderShippingSnapshots: vi.fn(),
}));

vi.mock('@/db', () => ({ db: { execute } }));
vi.mock('@/lib/logging', async () => {
  const { createQuietLoggingMock } =
    await import('@/lib/tests/helpers/quiet-logging');
  return createQuietLoggingMock();
});
vi.mock('@/lib/services/shop/shipping/retention', () => ({
  anonymizeRetainedOrderShippingSnapshots,
}));

const now = Date.parse('2026-01-01T00:00:00.000Z');
const dialect = new PgDialect();

function shippingRequest(path: string, body: object) {
  return new NextRequest(
    'http://localhost/api/shop/internal/shipping/' + path,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-janitor-secret': 'shipping-test-secret',
        'x-request-id': 'shipping-test-request',
      },
      body: JSON.stringify({ ...body, minIntervalSeconds: 10 }),
    }
  );
}

beforeEach(() => {
  execute.mockReset();
  anonymizeRetainedOrderShippingSnapshots.mockReset();
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('RATE_LIMIT_DISABLED', 'false');
  vi.stubEnv('INTERNAL_JANITOR_SECRET', 'shipping-test-secret');
  vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_RETENTION_ENABLED', 'true');
  vi.spyOn(Date, 'now').mockReturnValue(now);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('internal shipping job slots', () => {
  it.each([
    ['np/sync', syncNovaPoshta, 'shipping-np-sync', { q: 'Kyiv' }],
    ['retention/run', runRetention, 'shipping-retention-run', {}],
    ['shipments/run', runShipments, 'shipping-shipments-run', {}],
  ] as const)(
    'throttles %s with its own job name and retry header',
    async (path, handler, jobName, body) => {
      execute.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [{ next_allowed_at: new Date(now + 2300).toISOString() }],
      });

      const response = await handler(shippingRequest(path, body));

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('3');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Request-Id')).toBe(
        'shipping-test-request'
      );
      expect(await response.json()).toEqual({
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds: 3,
      });
      expect(execute).toHaveBeenCalledTimes(2);

      const insert = dialect.sqlToQuery(execute.mock.calls[0][0]);
      expect(insert.sql).toContain('ON CONFLICT (job_name) DO UPDATE');
      expect(insert.sql).toContain(
        'WHERE internal_job_state.next_allowed_at <= now()'
      );
      expect(insert.params).toEqual([
        jobName,
        60,
        expect.any(String),
        60,
        expect.any(String),
      ]);
      expect(insert.params[2]).toBe(insert.params[4]);
      expect(dialect.sqlToQuery(execute.mock.calls[1][0]).params).toEqual([
        jobName,
      ]);
    }
  );

  it('returns immediately when the database grants the slot', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(now) }],
    });

    await expect(
      acquireShippingJobSlot({
        jobName: 'shipping-np-sync',
        minIntervalSeconds: 60,
        runId: '11111111-1111-4111-8111-111111111111',
      })
    ).resolves.toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('keeps the retention bypass in local mode', async () => {
    vi.stubEnv('APP_ENV', 'local');
    anonymizeRetainedOrderShippingSnapshots.mockResolvedValue({ processed: 0 });

    const response = await runRetention(shippingRequest('retention/run', {}));

    expect(response.status).toBe(200);
    expect(anonymizeRetainedOrderShippingSnapshots).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});
