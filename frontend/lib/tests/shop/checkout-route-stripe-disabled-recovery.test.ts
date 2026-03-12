import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateOrderWithItems = vi.fn();
const mockFindExistingCheckoutOrderByIdempotencyKey = vi.fn();
const mockRestockOrder = vi.fn();
const mockEnsureStripePaymentIntentForOrder = vi.fn();
const mockGetCurrentUser = vi.fn();
const mockGuardBrowserSameOrigin = vi.fn();
const mockEnforceRateLimit = vi.fn();
const mockRateLimitResponse = vi.fn();
const mockResolveRequestLocale = vi.fn();
const mockCreateStatusToken = vi.fn();
const mockIsStripePaymentsEnabled = vi.fn();
const mockIsMethodAllowed = vi.fn();
const mockReadPositiveIntEnv = vi.fn();

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock('@/lib/env/monobank', () => ({
  isMonobankEnabled: vi.fn(() => false),
}));

vi.mock('@/lib/env/readPositiveIntEnv', () => ({
  readPositiveIntEnv: mockReadPositiveIntEnv,
}));

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: mockIsStripePaymentsEnabled,
}));

vi.mock('@/lib/logging', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@/lib/logging/monobank', () => ({
  MONO_MISMATCH: 'MONO_MISMATCH',
  monoLogWarn: vi.fn(),
}));

vi.mock('@/lib/security/origin', () => ({
  guardBrowserSameOrigin: mockGuardBrowserSameOrigin,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  enforceRateLimit: mockEnforceRateLimit,
  getRateLimitSubject: vi.fn(() => 'ip:test'),
  rateLimitResponse: mockRateLimitResponse,
}));

vi.mock('@/lib/services/orders', () => ({
  createOrderWithItems: mockCreateOrderWithItems,
  findExistingCheckoutOrderByIdempotencyKey:
    mockFindExistingCheckoutOrderByIdempotencyKey,
  restockOrder: mockRestockOrder,
}));

vi.mock('@/lib/services/orders/payment-attempts', () => ({
  ensureStripePaymentIntentForOrder: mockEnsureStripePaymentIntentForOrder,
  PaymentAttemptsExhaustedError: class PaymentAttemptsExhaustedError extends Error {
    provider: string;
    orderId: string;

    constructor(orderId: string, provider = 'stripe') {
      super('Payment attempts exhausted');
      this.orderId = orderId;
      this.provider = provider;
    }
  },
}));

vi.mock('@/lib/shop/currency', () => ({
  resolveCurrencyFromLocale: vi.fn(() => 'USD'),
}));

vi.mock('@/lib/shop/payments', () => ({
  isMethodAllowed: mockIsMethodAllowed,
}));

vi.mock('@/lib/shop/request-locale', () => ({
  resolveRequestLocale: mockResolveRequestLocale,
}));

vi.mock('@/lib/shop/status-token', () => ({
  createStatusToken: mockCreateStatusToken,
}));

vi.mock('@/lib/validation/shop', () => ({
  checkoutPayloadSchema: {
    safeParse: vi.fn(() => ({
      success: true,
      data: {
        items: [{ productId: 'prod_1', quantity: 1 }],
        userId: null,
        shipping: null,
        country: null,
        legalConsent: null,
      },
    })),
  },
  idempotencyKeySchema: {
    safeParse: vi.fn((value: string) => ({
      success: true,
      data: value,
    })),
  },
}));

describe('checkout route - stripe disabled recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockGetCurrentUser.mockResolvedValue(null);
    mockGuardBrowserSameOrigin.mockReturnValue(null);
    mockEnforceRateLimit.mockResolvedValue({ ok: true });
    mockRateLimitResponse.mockImplementation(() => {
      throw new Error('rateLimitResponse should not be called in this test');
    });
    mockResolveRequestLocale.mockReturnValue('en');
    mockCreateStatusToken.mockReturnValue('status-token');
    mockIsStripePaymentsEnabled.mockReturnValue(false);
    mockIsMethodAllowed.mockReturnValue(true);
    mockReadPositiveIntEnv.mockImplementation(
      (_name: string, fallback: number) => fallback
    );

    mockCreateOrderWithItems.mockReset();
    mockFindExistingCheckoutOrderByIdempotencyKey.mockReset();
    mockRestockOrder.mockReset();
    mockEnsureStripePaymentIntentForOrder.mockReset();
  });

  function makeRequest(body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3000/api/shop/checkout', {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'Idempotency-Key': 'idem_key_1234567890',
      }),
      body: JSON.stringify(body),
    });
  }

  it('stripe disabled + existing order => returns recovery response and does not init stripe', async () => {
    mockFindExistingCheckoutOrderByIdempotencyKey.mockResolvedValue({
      id: 'order_existing_1',
      currency: 'USD',
      totalAmount: 25,
      paymentStatus: 'pending',
      paymentProvider: 'stripe',
      paymentIntentId: 'pi_existing_1',
    });

    const { POST } = await import('@/app/api/shop/checkout/route');

    const response = await POST(makeRequest({ paymentProvider: 'stripe' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.orderId).toBe('order_existing_1');
    expect(json.paymentProvider).toBe('stripe');
    expect(json.paymentIntentId).toBe('pi_existing_1');
    expect(json.clientSecret).toBeNull();
    expect(json.statusToken).toBe('status-token');

    expect(mockFindExistingCheckoutOrderByIdempotencyKey).toHaveBeenCalledWith(
      'idem_key_1234567890'
    );
    expect(mockCreateOrderWithItems).not.toHaveBeenCalled();
    expect(mockEnsureStripePaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it('stripe disabled + no existing order => returns 503 and does not create new order', async () => {
    mockFindExistingCheckoutOrderByIdempotencyKey.mockResolvedValue(null);

    const { POST } = await import('@/app/api/shop/checkout/route');

    const response = await POST(makeRequest({ paymentProvider: 'stripe' }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.code).toBe('PSP_UNAVAILABLE');

    expect(mockFindExistingCheckoutOrderByIdempotencyKey).toHaveBeenCalledWith(
      'idem_key_1234567890'
    );
    expect(mockCreateOrderWithItems).not.toHaveBeenCalled();
    expect(mockEnsureStripePaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it('explicit stripe method without provider + existing order => still recovers by idempotency key', async () => {
    mockFindExistingCheckoutOrderByIdempotencyKey.mockResolvedValue({
      id: 'order_existing_default',
      currency: 'USD',
      totalAmount: 30,
      paymentStatus: 'pending',
      paymentProvider: 'stripe',
      paymentIntentId: 'pi_existing_default',
    });

    const { POST } = await import('@/app/api/shop/checkout/route');

    const response = await POST(makeRequest({ paymentMethod: 'stripe_card' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.orderId).toBe('order_existing_default');
    expect(json.paymentProvider).toBe('stripe');
    expect(mockCreateOrderWithItems).not.toHaveBeenCalled();
    expect(mockEnsureStripePaymentIntentForOrder).not.toHaveBeenCalled();
  });

  it('new order + required status token creation failure => restocks and returns 500', async () => {
    mockIsStripePaymentsEnabled.mockReturnValue(true);
    mockCreateStatusToken.mockImplementation(() => {
      throw new Error('token failed');
    });

    mockCreateOrderWithItems.mockResolvedValue({
      isNew: true,
      totalCents: 2500,
      order: {
        id: 'order_new_1',
        currency: 'USD',
        totalAmount: 25,
        paymentStatus: 'pending',
        paymentProvider: 'stripe',
        paymentIntentId: null,
      },
    });

    const { POST } = await import('@/app/api/shop/checkout/route');

    const response = await POST(
      makeRequest({ paymentProvider: 'stripe' }) as any
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.code).toBe('CHECKOUT_FAILED');

    expect(mockRestockOrder).toHaveBeenCalledWith('order_new_1', {
      reason: 'failed',
    });
  });
});
