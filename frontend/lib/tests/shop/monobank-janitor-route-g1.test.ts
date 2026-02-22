import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbExecuteMock = vi.fn();
const runMonobankJanitorJob1Mock = vi.fn();
const runMonobankJanitorJob2Mock = vi.fn();
const runMonobankJanitorJob3Mock = vi.fn();
const runMonobankJanitorJob4Mock = vi.fn();

vi.mock('@/db', () => ({
  db: {
    execute: dbExecuteMock,
  },
}));

vi.mock('@/lib/services/orders/monobank-janitor', () => ({
  runMonobankJanitorJob1: runMonobankJanitorJob1Mock,
  runMonobankJanitorJob2: runMonobankJanitorJob2Mock,
  runMonobankJanitorJob3: runMonobankJanitorJob3Mock,
  runMonobankJanitorJob4: runMonobankJanitorJob4Mock,
}));

vi.mock('@/lib/logging', () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

const { POST } = await import('@/app/api/shop/internal/monobank/janitor/route');

function makeReq(args: {
  body: unknown;
  secret?: string;
  contentType?: string;
  requestId?: string;
}) {
  const headers = new Headers();
  headers.set('content-type', args.contentType ?? 'application/json');
  if (args.secret) {
    headers.set('x-internal-janitor-secret', args.secret);
  }
  if (args.requestId) {
    headers.set('x-request-id', args.requestId);
  }

  return new NextRequest(
    'http://localhost/api/shop/internal/monobank/janitor',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(args.body),
    }
  );
}

describe('internal monobank janitor route (G1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('INTERNAL_JANITOR_SECRET', 'test-secret');
    vi.stubEnv('INTERNAL_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 UNAUTHORIZED when secret is missing/invalid', async () => {
    const missingSecretRes = await POST(
      makeReq({
        body: { job: 'job1' },
      })
    );
    expect(missingSecretRes.status).toBe(401);
    const missingSecretJson = await missingSecretRes.json();
    expect(missingSecretJson).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
    expect(missingSecretRes.headers.get('X-Request-Id')).toBe(
      missingSecretJson.requestId
    );

    const invalidSecretRes = await POST(
      makeReq({
        body: { job: 'job1' },
        secret: 'wrong-secret',
      })
    );

    expect(invalidSecretRes.status).toBe(401);
    const invalidSecretJson = await invalidSecretRes.json();
    expect(invalidSecretJson).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
    expect(invalidSecretRes.headers.get('X-Request-Id')).toBe(
      invalidSecretJson.requestId
    );
    expect(typeof invalidSecretJson.requestId).toBe('string');
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_PAYLOAD for unknown fields', async () => {
    const res = await POST(
      makeReq({
        secret: 'test-secret',
        body: { job: 'job1', unknown: true },
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      code: 'INVALID_PAYLOAD',
    });
    expect(res.headers.get('X-Request-Id')).toBe(json.requestId);
    expect(typeof json.requestId).toBe('string');
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it('returns 500 SERVER_MISCONFIG when internal secret env is missing', async () => {
    vi.stubEnv('INTERNAL_JANITOR_SECRET', '');
    vi.stubEnv('INTERNAL_SECRET', '');

    const res = await POST(
      makeReq({
        body: { job: 'job1' },
      })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      code: 'SERVER_MISCONFIG',
      message: 'Internal auth is not configured',
    });
    expect(res.headers.get('X-Request-Id')).toBe(json.requestId);
    expect(typeof json.requestId).toBe('string');
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it('returns 200 for job4 and includes needs_review report', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob4Mock.mockResolvedValueOnce({
      processed: 0,
      applied: 0,
      noop: 0,
      failed: 0,
      report: {
        count: 2,
        oldestAgeMinutes: 1440,
        topReasons: [{ reason: 'MISSING_REFERENCE', count: 2 }],
      },
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g5-200',
        body: { job: 'job4', dryRun: true, limit: 50 },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      job: 'job4',
      dryRun: true,
      limit: 50,
      processed: 0,
      applied: 0,
      noop: 0,
      failed: 0,
      report: {
        count: 2,
        oldestAgeMinutes: 1440,
        topReasons: [{ reason: 'MISSING_REFERENCE', count: 2 }],
      },
      requestId: 'req-g5-200',
    });
    expect(res.headers.get('X-Request-Id')).toBe('req-g5-200');
    expect(runMonobankJanitorJob4Mock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for job1 and keeps stable success shape', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob1Mock.mockResolvedValueOnce({
      processed: 3,
      applied: 2,
      noop: 1,
      failed: 0,
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g2-200',
        body: { job: 'job1', dryRun: false, limit: 25 },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      job: 'job1',
      dryRun: false,
      limit: 25,
      processed: 3,
      applied: 2,
      noop: 1,
      failed: 0,
      requestId: 'req-g2-200',
    });
    expect(res.headers.get('X-Request-Id')).toBe('req-g2-200');

    expect(runMonobankJanitorJob1Mock).toHaveBeenCalledTimes(1);
    expect(runMonobankJanitorJob1Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        limit: 25,
        requestId: 'req-g2-200',
      })
    );
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for job2 and keeps stable success shape', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob2Mock.mockResolvedValueOnce({
      processed: 5,
      applied: 4,
      noop: 1,
      failed: 0,
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g3-200',
        body: { job: 'job2', dryRun: false, limit: 40 },
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      job: 'job2',
      dryRun: false,
      limit: 40,
      processed: 5,
      applied: 4,
      noop: 1,
      failed: 0,
      requestId: 'req-g3-200',
    });
    expect(res.headers.get('X-Request-Id')).toBe('req-g3-200');

    expect(runMonobankJanitorJob2Mock).toHaveBeenCalledTimes(1);
    expect(runMonobankJanitorJob2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        limit: 40,
        requestId: 'req-g3-200',
      })
    );
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when job3 is called and MONO_WEBHOOK_MODE is not store', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob3Mock.mockRejectedValueOnce({
      code: 'MONO_WEBHOOK_MODE_NOT_STORE',
      status: 409,
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g4-409',
        body: { job: 'job3', dryRun: false, limit: 30 },
      })
    );

    expect(res.status).toBe(409);
    expect(res.headers.get('X-Request-Id')).toBe('req-g4-409');
    const json = await res.json();
    expect(json).toEqual({
      success: false,
      code: 'MONO_WEBHOOK_MODE_NOT_STORE',
      requestId: 'req-g4-409',
    });
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for job3 and keeps stable success shape', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob3Mock.mockResolvedValueOnce({
      processed: 2,
      applied: 1,
      noop: 1,
      failed: 0,
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g4-200',
        body: { job: 'job3', dryRun: false, limit: 60 },
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('req-g4-200');
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      job: 'job3',
      dryRun: false,
      limit: 60,
      processed: 2,
      applied: 1,
      noop: 1,
      failed: 0,
      requestId: 'req-g4-200',
    });

    expect(runMonobankJanitorJob3Mock).toHaveBeenCalledTimes(1);
    expect(runMonobankJanitorJob3Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        dryRun: false,
        limit: 60,
        requestId: 'req-g4-200',
      })
    );
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('returns 429 RATE_LIMITED with Retry-After when DB gate blocks', async () => {
    dbExecuteMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 5000).toISOString() }],
    });

    const res = await POST(
      makeReq({
        secret: 'test-secret',
        requestId: 'req-g1-429',
        body: { job: 'job3' },
      })
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      code: 'RATE_LIMITED',
      requestId: 'req-g1-429',
    });
    expect(res.headers.get('X-Request-Id')).toBe('req-g1-429');
    expect(typeof json.retryAfterSeconds).toBe('number');
    expect(json.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(dbExecuteMock).toHaveBeenCalledTimes(2);
  });
});
