// frontend/lib/tests/checkout-stripe-error-contract.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// 1) force payments enabled so route goes into Stripe flow
vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: () => true,
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

function makeReq(idempotencyKey: string) {
  return new NextRequest('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      'Accept-Language': 'en',
    },
    body: JSON.stringify({
      items: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
          selectedSize: '',
          selectedColor: '',
        },
      ],
    }),
  });
}

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

    const res = await POST(makeReq('idem_key_test_new_0001'));
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
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

    const res = await POST(makeReq('idem_key_test_existing_0001'));
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
  });
});
