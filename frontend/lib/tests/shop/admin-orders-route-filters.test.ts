import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminOrdersPageMock = vi.hoisted(() => vi.fn());
const requireAdminApiMock = vi.hoisted(() => vi.fn(async () => ({ id: 'a1' })));
const requireAdminCsrfMock = vi.hoisted(() => vi.fn(() => null));
const guardBrowserSameOriginMock = vi.hoisted(() => vi.fn(() => null));
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());
const adminAuthErrors = vi.hoisted(() => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED';
  }

  class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED';
  }

  class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN';
  }

  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
  };
});

vi.mock('@/db/queries/shop/admin-orders', () => ({
  getAdminOrdersPage: (args: unknown) => getAdminOrdersPageMock(args),
}));

vi.mock('@/lib/auth/admin', () => ({
  ...adminAuthErrors,
  requireAdminApi: (request: unknown) => (requireAdminApiMock as any)(request),
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: (request: unknown, scope: string) =>
    (requireAdminCsrfMock as any)(request, scope),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: (request: unknown) =>
    (guardBrowserSameOriginMock as any)(request),
}));

vi.mock('@/lib/logging', () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

import { GET } from '@/app/api/shop/admin/orders/route';

describe('admin orders route filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminOrdersPageMock.mockResolvedValue({
      total: 1,
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          userId: null,
          totalAmountMinor: 1000,
          totalAmount: '10.00',
          currency: 'USD',
          paymentStatus: 'paid',
          paymentProvider: 'stripe',
          paymentIntentId: null,
          createdAt: new Date('2026-03-05T12:00:00.000Z'),
          itemCount: 1,
        },
      ],
    });
  });

  it('passes validated filters through to the query layer', async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost/api/shop/admin/orders?limit=10&offset=20&status=paid&dateFrom=2026-03-01&dateTo=2026-03-31',
        {
          method: 'GET',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      )
    );

    expect(res.status).toBe(200);
    expect(getAdminOrdersPageMock).toHaveBeenCalledTimes(1);

    const args = getAdminOrdersPageMock.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      limit: 10,
      offset: 20,
      status: 'paid',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(args.createdAtGte.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(args.createdAtLt.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('rejects invalid status values with a controlled 400 response', async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost/api/shop/admin/orders?status=not-a-status',
        {
          method: 'GET',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      )
    );

    expect(res.status).toBe(400);
    expect(getAdminOrdersPageMock).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.code).toBe('INVALID_QUERY');
  });

  it('rejects inverted date ranges with a controlled 400 response', async () => {
    const res = await GET(
      new NextRequest(
        'http://localhost/api/shop/admin/orders?dateFrom=2026-04-02&dateTo=2026-03-31',
        {
          method: 'GET',
          headers: {
            origin: 'http://localhost:3000',
          },
        }
      )
    );

    expect(res.status).toBe(400);
    expect(getAdminOrdersPageMock).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.code).toBe('INVALID_QUERY');
  });
});
