import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetEnvCache } from '@/lib/env';

const dbExecuteMock = vi.fn();

vi.mock('@/db', () => ({
  db: {
    execute: (...args: any[]) => dbExecuteMock(...args),
  },
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const { POST } = await import('@/app/api/shop/internal/shipping/retention/run/route');

describe('internal shipping retention route (phase 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'https://example.com/db');
    vi.stubEnv('INTERNAL_JANITOR_SECRET', 'test-secret');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_RETENTION_ENABLED', 'true');
    resetEnvCache();
  });

  it('rejects unauthorized request without internal secret header', async () => {
    const req = new NextRequest(
      'http://localhost/api/shop/internal/shipping/retention/run',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 10 }),
      }
    );

    const res = await POST(req);
    const json: any = await res.json();

    expect(res.status).toBe(401);
    expect(json).toMatchObject({
      success: false,
      code: 'UNAUTHORIZED',
    });
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });
});
