import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
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

vi.mock('@/lib/services/orders', async () => {
  const actual = await vi.importActual<any>('@/lib/services/orders');
  return {
    ...actual,
    createOrderWithItems: vi.fn(),
    restockOrder: vi.fn(),
  };
});

vi.mock('@/lib/services/orders/payment-attempts', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/orders/payment-attempts'
  );
  return {
    ...actual,
    ensureStripePaymentIntentForOrder: vi.fn(),
  };
});

import { POST } from '@/app/api/shop/checkout/route';
import { createOrderWithItems, restockOrder } from '@/lib/services/orders';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';

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

describe('checkout: stripe payment-init failures after order creation', () => {
  it('new order (isNew=true): payment-init failure returns 502 STRIPE_ERROR and restocks', async () => {
    const co = createOrderWithItems as unknown as MockedFn;
    const ensurePI = ensureStripePaymentIntentForOrder as unknown as MockedFn;
    const restock = restockOrder as unknown as MockedFn;

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
    ensurePI.mockRejectedValueOnce(new Error('STRIPE_TEST_DOWN'));

    const res = await POST(
      makeCheckoutReq({ idempotencyKey: 'idem_key_test_new_0001' })
    );
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
    expect(createOrderWithItems).toHaveBeenCalledTimes(1);
    expect(ensurePI).toHaveBeenCalledWith({
      orderId: 'order_test_new',
      existingPaymentIntentId: null,
    });
    expect(restock).toHaveBeenCalledWith('order_test_new', {
      reason: 'failed',
    });
  });

  it('existing order (isNew=false, no PI): payment-init failure returns 502 STRIPE_ERROR without restocking', async () => {
    const co = createOrderWithItems as unknown as MockedFn;
    const ensurePI = ensureStripePaymentIntentForOrder as unknown as MockedFn;
    const restock = restockOrder as unknown as MockedFn;

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
    ensurePI.mockRejectedValueOnce(new Error('STRIPE_TEST_DOWN'));

    const res = await POST(
      makeCheckoutReq({ idempotencyKey: 'idem_key_test_existing_0001' })
    );
    expect(res.status).toBe(502);

    const json = await res.json();
    expect(json.code).toBe('STRIPE_ERROR');
    expect(typeof json.message).toBe('string');
    expect(createOrderWithItems).toHaveBeenCalledTimes(1);
    expect(ensurePI).toHaveBeenCalledWith({
      orderId: 'order_test_existing',
      existingPaymentIntentId: null,
    });
    expect(restock).not.toHaveBeenCalled();
  });
});
