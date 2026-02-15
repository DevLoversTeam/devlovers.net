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
  origin?: string;
  requestId?: string;
}) {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (args.secret) headers.set('x-internal-janitor-secret', args.secret);
  if (args.origin) headers.set('origin', args.origin);
  if (args.requestId) headers.set('x-request-id', args.requestId);

  return new NextRequest(
    'http://localhost/api/shop/internal/monobank/janitor',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(args.body),
    }
  );
}

describe('internal monobank janitor origin posture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('INTERNAL_JANITOR_SECRET', 'test-secret');
    vi.stubEnv('INTERNAL_SECRET', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects requests with Origin header using ORIGIN_BLOCKED + no-store', async () => {
    const req = makeReq({
      body: { job: 'job1' },
      secret: 'test-secret',
      origin: 'http://localhost:3000',
      requestId: 'req-origin-blocked',
    });

    const failIfBodyRead = vi.fn(async () => {
      throw new Error('BODY_READ_BEFORE_ORIGIN_GUARD');
    });
    (req as any).arrayBuffer = failIfBodyRead;
    (req as any).text = failIfBodyRead;
    (req as any).json = failIfBodyRead;
    (req as any).formData = failIfBodyRead;

    const res = await POST(req);

    const json: any = await res.json();
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Request-Id')).toBe('req-origin-blocked');
    expect(json).toMatchObject({
      error: { code: 'ORIGIN_BLOCKED' },
      surface: 'monobank_janitor',
    });
    expect(typeof json?.error?.message).toBe('string');
    expect(dbExecuteMock).not.toHaveBeenCalled();
    expect(runMonobankJanitorJob1Mock).not.toHaveBeenCalled();
    expect(failIfBodyRead).not.toHaveBeenCalled();
  });

  it('continues processing when browser indicators are absent', async () => {
    dbExecuteMock.mockResolvedValueOnce({
      rows: [{ next_allowed_at: new Date(Date.now() + 1000).toISOString() }],
    });
    runMonobankJanitorJob1Mock.mockResolvedValueOnce({
      processed: 1,
      applied: 1,
      noop: 0,
      failed: 0,
    });

    const req = makeReq({
      body: { job: 'job1' },
      secret: 'test-secret',
      requestId: 'req-origin-allow',
    });

    const res = await POST(req);
    const body = await res.json();
    expect(body.success).toBe(true);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('req-origin-allow');
    expect(runMonobankJanitorJob1Mock).toHaveBeenCalledTimes(1);
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });
});
