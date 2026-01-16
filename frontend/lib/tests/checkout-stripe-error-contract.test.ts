import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCheckoutReq } from '@/lib/tests/helpers/makeCheckoutReq';

// 1) force payments enabled so route goes into Stripe flow
vi.mock('@/lib/env/stripe', () => ({
  getStripeEnv: () => ({
    paymentsEnabled: true,
    mode: 'test',
    secretKey: 'sk_test_dummy',
    webhookSecret: 'whsec_test_dummy',
  }),
  isPaymentsEnabled: () => true, // kept for backward compatibility
}));

// 2) avoid auth coupling
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

// 3) force Stripe PI creation to fail AFTER "DB writes" (simulated by createOrderWithItems resolving)
vi.mock('@/lib/psp/stripe', () => ({
  createPaymentIntent: vi.fn(async () => {
    throw new Error('STRIPE_TEST_DOWN');
  }),
  retrievePaymentIntent: vi.fn(),
}));

// 4) mock orders services so we don't depend on DB schema/seed here
vi.mock('@/lib/services/orders', async () => {
  const actual = await vi.importActual<any>('@/lib/services/orders');
  return {
    ...actual,
    createOrderWithItems: vi.fn(),
    setOrderPaymentIntent: vi.fn(),
    restockOrder: vi.fn(),
  };
});

import { POST } from '@/app/api/shop/checkout/route';
import { createOrderWithItems } from '@/lib/services/orders';

type MockedFn = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkout: Stripe errors after order creation must not be 400', () => {
  it('new order (isNew=true): Stripe PI creation failure returns 502 STRIPE_ERROR', async () => {
    const co = createOrderWithItems as unknown as MockedFn;

    co.mockResolvedValueOnce({
      order: {
        id: 'order_test_new',
        currency: 'USD',
        totalAmount: 10,
        paymentStatus: 'pending',
        paymentProvider: 'stripe',
        paymentIntentId: null,
      },
      isNew: true,
      totalCents: 1000,
    });

    const res = await POST(
      makeCheckoutReq({ idempotencyKey: 'idem_key_test_new_0001' })
    );
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
    expect(createOrderWithItems).toHaveBeenCalledTimes(1);
  });

  it('existing order (isNew=false, no PI): Stripe PI creation failure returns 502 STRIPE_ERROR', async () => {
    const co = createOrderWithItems as unknown as MockedFn;

    co.mockResolvedValueOnce({
      order: {
        id: 'order_test_existing',
        currency: 'USD',
        totalAmount: 10,
        paymentStatus: 'pending',
        paymentProvider: 'stripe',
        paymentIntentId: null,
      },
      isNew: false,
      totalCents: 1000,
    });

    const res = await POST(
      makeCheckoutReq({ idempotencyKey: 'idem_key_test_existing_0001' })
    );
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
    expect(createOrderWithItems).toHaveBeenCalledTimes(1);
  });
});
