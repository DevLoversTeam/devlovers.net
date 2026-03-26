import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminApiMock = vi.hoisted(() => vi.fn(async () => ({ id: 'a1' })));
const requireAdminCsrfMock = vi.hoisted(() => vi.fn(() => null));
const guardBrowserSameOriginMock = vi.hoisted(() => vi.fn(() => null));
const applyAdminOrderLifecycleActionMock = vi.hoisted(() =>
  vi.fn(async () => ({ changed: true }))
);
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());
const adminAuthErrors = vi.hoisted(() => {
  class AdminApiDisabledError extends Error {
    code = 'ADMIN_API_DISABLED';
  }

  class AdminUnauthorizedError extends Error {
    code = 'UNAUTHORIZED';
  }

  class AdminForbiddenError extends Error {
    code = 'FORBIDDEN';
  }

  return {
    AdminApiDisabledError,
    AdminUnauthorizedError,
    AdminForbiddenError,
  };
});

vi.mock('@/lib/auth/admin', () => ({
  ...adminAuthErrors,
  requireAdminApi: (request: unknown) => (requireAdminApiMock as any)(request),
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: (...args: unknown[]) =>
    (requireAdminCsrfMock as any)(...args),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: (request: unknown) =>
    (guardBrowserSameOriginMock as any)(request),
}));

vi.mock('@/lib/services/shop/admin-order-lifecycle', () => {
  class AdminOrderLifecycleActionError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }

  return {
    AdminOrderLifecycleActionError,
    applyAdminOrderLifecycleAction: (args: unknown) =>
      (applyAdminOrderLifecycleActionMock as any)(args),
  };
});

vi.mock('@/lib/logging', () => ({
  logWarn: (...args: unknown[]) => logWarnMock(...args),
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

import { POST } from '@/app/[locale]/admin/shop/orders/[id]/lifecycle/route';

describe('admin order lifecycle route redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects invalid order ids back to the detail path with an error code', async () => {
    const req = new NextRequest(
      'http://localhost/uk/admin/shop/orders/not-a-uuid/lifecycle',
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: new URLSearchParams({ action: 'confirm' }),
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({ locale: 'uk', id: 'not-a-uuid' }),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://localhost/uk/admin/shop/orders/not-a-uuid?lifecycleError=INVALID_ORDER_ID'
    );
    expect(requireAdminApiMock).not.toHaveBeenCalled();
  });

  it('redirects unauthenticated form posts to login with returnTo back to the order', async () => {
    requireAdminApiMock.mockRejectedValueOnce(
      new adminAuthErrors.AdminUnauthorizedError()
    );

    const req = new NextRequest(
      'http://localhost/en/admin/shop/orders/550e8400-e29b-41d4-a716-446655440000/lifecycle',
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: new URLSearchParams({ action: 'confirm' }),
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({
        locale: 'en',
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://localhost/en/login?returnTo=%2Fen%2Fadmin%2Fshop%2Forders%2F550e8400-e29b-41d4-a716-446655440000'
    );
  });

  it('redirects forbidden form posts back to detail with an error code', async () => {
    requireAdminApiMock.mockRejectedValueOnce(
      new adminAuthErrors.AdminForbiddenError()
    );

    const req = new NextRequest(
      'http://localhost/en/admin/shop/orders/550e8400-e29b-41d4-a716-446655440000/lifecycle',
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: new URLSearchParams({ action: 'confirm' }),
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({
        locale: 'en',
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'http://localhost/en/admin/shop/orders/550e8400-e29b-41d4-a716-446655440000?lifecycleError=FORBIDDEN'
    );
  });
});
