import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { makeCheckoutReq } from '@/lib/tests/helpers/makeCheckoutReq';

vi.mock('@/lib/env/stripe', () => ({
  getStripeEnv: () => ({
    paymentsEnabled: true,
    mode: 'test',
    secretKey: 'sk_test_dummy',
    webhookSecret: 'whsec_test_dummy',
  }),
  isPaymentsEnabled: () => true,
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/psp/stripe', () => ({
  createPaymentIntent: vi.fn(async () => {
    throw new Error('STRIPE_TEST_DOWN');
  }),
  retrievePaymentIntent: vi.fn(),
}));

vi.mock('@/lib/services/orders/payment-intent', () => ({
  readStripePaymentIntentParams: vi.fn(async () => ({
    amountMinor: 1000,
    currency: 'USD',
  })),
}));

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

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;
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
