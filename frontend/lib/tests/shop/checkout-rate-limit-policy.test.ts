import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const enforceRateLimitMock = vi.fn();
const createOrderWithItemsMock = vi.fn();

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(async () => null),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: vi.fn(() => null),
}));

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'rl_subject'),
  enforceRateLimit: (...args: any[]) => enforceRateLimitMock(...args),
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
}));

vi.mock('@/lib/services/orders', () => ({
  createOrderWithItems: (...args: any[]) => createOrderWithItemsMock(...args),
  restockOrder: vi.fn(),
}));

vi.mock('@/lib/services/orders/payment-attempts', () => ({
  ensureStripePaymentIntentForOrder: vi.fn(),
  PaymentAttemptsExhaustedError: class PaymentAttemptsExhaustedError extends Error {},
}));

const { POST } = await import('@/app/api/shop/checkout/route');

describe('checkout rate limit policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockResolvedValue({
      ok: false,
      retryAfterSeconds: 17,
    });
  });

  it('returns 429 + Retry-After + no-store when checkout limiter blocks', async () => {
    const req = new NextRequest('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'idem_key_12345678',
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        items: [
          {
            productId: '00000000-0000-4000-8000-000000000001',
            quantity: 1,
          },
        ],
      }),
    });

    const res = await POST(req);
    const json: any = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('17');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(json.code).toBe('RATE_LIMITED');
    expect(json.details?.scope).toBe('checkout');
    expect(enforceRateLimitMock).toHaveBeenCalledTimes(1);
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });
});
