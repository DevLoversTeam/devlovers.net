import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enforceRateLimitMock = vi.fn(
  async (..._args: any[]) => ({ ok: false, retryAfterSeconds: 9 })
);
const requireAdminApiMock = vi.fn(
  async (..._args: any[]) => ({ id: 'admin:root', role: 'admin' })
);

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: vi.fn(),
    logError: vi.fn(),
  };
});

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: requireAdminApiMock,
  AdminApiDisabledError: class AdminApiDisabledError extends Error {},
  AdminUnauthorizedError: class AdminUnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  },
  AdminForbiddenError: class AdminForbiddenError extends Error {
    code = 'FORBIDDEN';
  },
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/security/rate-limit', async () => {
  const actual = await vi.importActual<any>('@/lib/security/rate-limit');
  return {
    ...actual,
    enforceRateLimit: enforceRateLimitMock,
    rateLimitResponse: ({
      retryAfterSeconds,
      details,
    }: {
      retryAfterSeconds: number;
      details?: Record<string, unknown>;
    }) => {
      const res = NextResponse.json(
        {
          success: false,
          code: 'RATE_LIMITED',
          retryAfterSeconds,
          ...(details ? { details } : {}),
        },
        { status: 429 }
      );
      res.headers.set('Retry-After', String(retryAfterSeconds));
      res.headers.set('Cache-Control', 'no-store');
      return res;
    },
  };
});

const { POST } = await import('@/app/api/shop/admin/orders/[id]/refund/route');

describe('monobank admin refund rate limit policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfterSeconds: 9,
    });
  });

  it('returns 429 + Retry-After + no-store when admin refund limiter blocks', async () => {
    const req = new NextRequest(
      'http://localhost/api/shop/admin/orders/00000000-0000-4000-8000-000000000001/refund',
      {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' }),
    });
    const json: any = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('9');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json.code).toBe('RATE_LIMITED');
    expect(json.details?.scope).toBe('admin_refund');
    expect(enforceRateLimitMock).toHaveBeenCalledTimes(1);
    expect(requireAdminApiMock).toHaveBeenCalledTimes(1);
    expect((enforceRateLimitMock.mock.calls[0]?.[0]?.key as string) ?? '').toContain(
      'admin_refund:admin_'
    );
  });
});
