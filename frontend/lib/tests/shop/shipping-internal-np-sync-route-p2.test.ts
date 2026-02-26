import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { POST } = await import('@/app/api/shop/internal/shipping/np/sync/route');

describe('internal shipping np sync route (phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('INTERNAL_JANITOR_SECRET', 'test-secret');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
  });

  it('rejects unauthorized request without internal secret', async () => {
    const req = new NextRequest(
      'http://localhost/api/shop/internal/shipping/np/sync',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ q: 'Ky', limit: 10 }),
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
