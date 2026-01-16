import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCheckoutReq } from '@/lib/tests/helpers/makeCheckoutReq';
import { InvalidPayloadError } from '@/lib/services/errors';

// Force payments enabled so route goes into Stripe flow
// gitleaks:allow
vi.mock('@/lib/env/stripe', () => ({
  getStripeEnv: () => ({
    paymentsEnabled: true,
    mode: 'test',
    secretKey: 'sk_test_dummy',
    webhookSecret: 'whsec_test_dummy',
  }),
  isPaymentsEnabled: () => true, // kept for backward compatibility
}));

// Avoid auth coupling
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

// Stripe: PI creation succeeds
vi.mock('@/lib/psp/stripe', () => ({
  createPaymentIntent: vi.fn(async () => ({
    paymentIntentId: 'pi_test_attach_reject',
    clientSecret: 'cs_test_attach_reject',
  })),
  retrievePaymentIntent: vi.fn(),
}));

// Mock order services
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
import {
  createOrderWithItems,
  setOrderPaymentIntent,
  restockOrder,
} from '@/lib/services/orders';

type MockedFn = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkout: setOrderPaymentIntent rejection after order creation must not be 400', () => {
  it('new order (isNew=true): attach rejection returns 409 CHECKOUT_CONFLICT (not 400)', async () => {
    const co = createOrderWithItems as unknown as MockedFn;
    const setPI = setOrderPaymentIntent as unknown as MockedFn;
    const restock = restockOrder as unknown as MockedFn;

    co.mockResolvedValueOnce({
      order: {
        id: 'order_test_new_attach_reject',
        currency: 'USD',
        totalAmount: 10,
        paymentStatus: 'pending',
        paymentProvider: 'stripe',
        paymentIntentId: null,
      },
      isNew: true,
      totalCents: 1000,
    });

    setPI.mockRejectedValueOnce(
      new InvalidPayloadError(
        'Order cannot accept a payment intent from the current status.'
      )
    );
    const res = await POST(
      makeCheckoutReq({
        idempotencyKey: 'idem_key_test_new_attach_reject_0001',
      })
    );

    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.code).toBe('CHECKOUT_CONFLICT');

    // Policy: conflict should not trigger immediate restock here.
    expect(restock).not.toHaveBeenCalled();
  });

  it('existing order (isNew=false, no PI): attach rejection returns 409 CHECKOUT_CONFLICT (not 400)', async () => {
    const co = createOrderWithItems as unknown as MockedFn;
    const setPI = setOrderPaymentIntent as unknown as MockedFn;
    const restock = restockOrder as unknown as MockedFn;

    co.mockResolvedValueOnce({
      order: {
        id: 'order_test_existing_attach_reject',
        currency: 'USD',
        totalAmount: 10,
        paymentStatus: 'pending',
        paymentProvider: 'stripe',
        paymentIntentId: null,
      },
      isNew: false,
      totalCents: 1000,
    });

    setPI.mockRejectedValueOnce(
      new InvalidPayloadError(
        'Order cannot accept a payment intent from the current status.'
      )
    );

    const res = await POST(
      makeCheckoutReq({
        idempotencyKey: 'idem_key_test_existing_attach_reject_0001',
      })
    );

    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.code).toBe('CHECKOUT_CONFLICT');

    expect(restock).not.toHaveBeenCalled();
  });
});
