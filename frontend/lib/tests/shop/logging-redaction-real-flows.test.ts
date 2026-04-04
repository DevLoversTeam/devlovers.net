import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestLegalConsent } from './test-legal-consent';

function parseLoggedJson(spy: ReturnType<typeof vi.spyOn>, index = 0) {
  return JSON.parse(String(spy.mock.calls[index]?.[0] ?? '{}')) as Record<
    string,
    unknown
  >;
}

function expectNoSensitiveText(raw: string) {
  expect(raw).not.toContain('buyer@example.com');
  expect(raw).not.toContain('+380501112233');
  expect(raw).not.toContain('abc.def.ghi');
  expect(raw).not.toContain('tok_secret_123');
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('LOG_LEVEL', 'debug');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ENV', 'local');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('shop logging redaction real flows', () => {
  it('checkout route logs sanitized auth-resolution errors with useful meta', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@/lib/security/origin', () => ({
      guardBrowserSameOrigin: () => null,
    }));
    vi.doMock('@/lib/shop/commercial-policy.server', () => ({
      resolveStandardStorefrontProviderCapabilities: () => ({
        stripeCheckoutEnabled: true,
        monobankCheckoutEnabled: false,
        monobankGooglePayEnabled: false,
        enabledProviders: ['stripe'],
      }),
    }));
    vi.doMock('@/lib/security/rate-limit', () => ({
      getRateLimitSubject: vi.fn(() => 'checkout_logging_subject'),
      enforceRateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
      rateLimitResponse: ({
        retryAfterSeconds,
      }: {
        retryAfterSeconds: number;
      }) =>
        NextResponse.json(
          { success: false, code: 'RATE_LIMITED', retryAfterSeconds },
          { status: 429 }
        ),
    }));
    vi.doMock('@/lib/auth', () => ({
      getCurrentUser: vi.fn(async () => {
        throw new Error(
          'buyer@example.com +380501112233 Bearer abc.def.ghi tok_secret_123'
        );
      }),
    }));
    vi.doMock('@/lib/env/stripe', () => ({
      isPaymentsEnabled: () => true,
    }));
    vi.doMock('@/lib/env/monobank', () => ({
      isMonobankEnabled: () => false,
    }));

    const { POST } = await import('@/app/api/shop/checkout/route');
    const res = await POST(
      new NextRequest('http://localhost/api/shop/checkout', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          'idempotency-key': '123e4567-e89b-12d3-a456-426614174000',
          'x-request-id': 'checkout-redaction-test',
        },
        body: JSON.stringify({
          legalConsent: createTestLegalConsent(),
          userId: '11111111-1111-1111-1111-111111111111',
          items: [
            {
              productId: '22222222-2222-2222-2222-222222222222',
              quantity: 1,
            },
          ],
          paymentProvider: 'stripe',
          paymentMethod: 'stripe_card',
          paymentCurrency: 'USD',
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('USER_ID_NOT_ALLOWED');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const errorRaw = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expectNoSensitiveText(errorRaw);
    const errorPayload = parseLoggedJson(errorSpy);
    expect(errorPayload.msg).toBe('checkout_auth_user_resolve_failed');
    expect(errorPayload.meta).toMatchObject({
      requestId: 'checkout-redaction-test',
      route: '/api/shop/checkout',
      method: 'POST',
      code: 'AUTH_USER_RESOLVE_FAILED',
    });
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_EMAIL]'
    );
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_PHONE]'
    );
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      'Bearer [REDACTED_SECRET]'
    );

    const warnPayload = parseLoggedJson(warnSpy);
    expect(warnPayload.msg).toBe('checkout_user_id_not_allowed');
    expect(warnPayload.meta).toMatchObject({
      requestId: 'checkout-redaction-test',
      code: 'USER_ID_NOT_ALLOWED',
      sessionUserId: null,
    });
  });

  it('admin orders route logs sanitized failures with useful operational meta', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    class AdminApiDisabledError extends Error {
      code = 'ADMIN_API_DISABLED';
    }
    class AdminUnauthorizedError extends Error {
      code = 'ADMIN_UNAUTHORIZED';
    }
    class AdminForbiddenError extends Error {
      code = 'ADMIN_FORBIDDEN';
    }

    vi.doMock('@/lib/security/origin', () => ({
      guardBrowserSameOrigin: () => null,
    }));
    vi.doMock('@/lib/security/admin-csrf', () => ({
      requireAdminCsrf: () => null,
    }));
    vi.doMock('@/lib/auth/admin', () => ({
      AdminApiDisabledError,
      AdminUnauthorizedError,
      AdminForbiddenError,
      requireAdminApi: vi.fn(async () => ({ id: 'admin_1' })),
    }));
    vi.doMock('@/db/queries/shop/admin-orders', () => ({
      getAdminOrdersPage: vi.fn(async () => {
        throw new Error(
          'admin buyer@example.com +380501112233 Bearer abc.def.ghi tok_secret_123'
        );
      }),
    }));

    const { GET } = await import('@/app/api/shop/admin/orders/route');
    const res = await GET(
      new NextRequest(
        'http://localhost/api/shop/admin/orders?limit=10&offset=0',
        {
          method: 'GET',
          headers: {
            origin: 'http://localhost:3000',
            'x-request-id': 'admin-redaction-test',
          },
        }
      )
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('INTERNAL_ERROR');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const raw = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expectNoSensitiveText(raw);

    const payload = parseLoggedJson(errorSpy);
    expect(payload.msg).toBe('admin_orders_list_failed');
    expect(payload.meta).toMatchObject({
      requestId: 'admin-redaction-test',
      route: '/api/shop/admin/orders',
      method: 'GET',
      code: 'ADMIN_ORDERS_LIST_FAILED',
    });
    expect(typeof (payload.meta as Record<string, unknown>).durationMs).toBe(
      'number'
    );
    expect((payload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_EMAIL]'
    );
    expect((payload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_PHONE]'
    );
    expect((payload.err as Record<string, unknown>).message).toContain(
      'Bearer [REDACTED_SECRET]'
    );
  });

  it('internal notifications run route logs sanitized worker failures with useful meta', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('@/lib/security/origin', () => ({
      guardNonBrowserFailClosed: () => null,
    }));
    vi.doMock('@/lib/auth/internal-janitor', () => ({
      requireInternalJanitorAuth: () => null,
    }));
    vi.doMock('@/lib/services/shop/notifications/projector', () => ({
      runNotificationOutboxProjector: vi.fn(async () => ({
        claimed: 0,
        projected: 0,
        inserted: 0,
        skipped: 0,
      })),
    }));
    vi.doMock('@/lib/services/shop/notifications/outbox-worker', () => ({
      countRunnableNotificationOutboxRows: vi.fn(async () => 0),
      runNotificationOutboxWorker: vi.fn(async () => {
        throw new Error(
          'notify buyer@example.com +380501112233 Bearer abc.def.ghi tok_secret_123'
        );
      }),
    }));

    const { POST } =
      await import('@/app/api/shop/internal/notifications/run/route');
    const res = await POST(
      new NextRequest('http://localhost/api/shop/internal/notifications/run', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'notifications-redaction-test',
        },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('INTERNAL_ERROR');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const warnRaw = String(warnSpy.mock.calls[0]?.[0] ?? '');
    const errorRaw = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expectNoSensitiveText(warnRaw);
    expectNoSensitiveText(errorRaw);

    const warnPayload = parseLoggedJson(warnSpy);
    expect(warnPayload.msg).toBe('shop_notifications_worker_failed');
    expect(warnPayload.meta).toMatchObject({
      requestId: 'notifications-redaction-test',
      route: '/api/shop/internal/notifications/run',
      method: 'POST',
      code: 'SHOP_NOTIFICATIONS_WORKER_FAILED',
    });
    expect(typeof (warnPayload.meta as Record<string, unknown>).runId).toBe(
      'string'
    );

    const errorPayload = parseLoggedJson(errorSpy);
    expect(errorPayload.msg).toBe('shop_notifications_worker_failed_error');
    expect(errorPayload.meta).toMatchObject({
      requestId: 'notifications-redaction-test',
      route: '/api/shop/internal/notifications/run',
      method: 'POST',
      code: 'SHOP_NOTIFICATIONS_WORKER_FAILED',
    });
    expect(typeof (errorPayload.meta as Record<string, unknown>).runId).toBe(
      'string'
    );
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_EMAIL]'
    );
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      '[REDACTED_PHONE]'
    );
    expect((errorPayload.err as Record<string, unknown>).message).toContain(
      'Bearer [REDACTED_SECRET]'
    );
  });
});
