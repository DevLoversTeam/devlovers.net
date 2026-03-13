import { NextRequest } from 'next/server';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { POST } from '@/app/api/shop/checkout/route';
import { createOrderWithItems } from '@/lib/services/orders';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/env/monobank', () => ({
  isMonobankEnabled: () => true,
}));

vi.mock('@/lib/services/orders', async () => {
  const actual = await vi.importActual<any>('@/lib/services/orders');
  return {
    ...actual,
    createOrderWithItems: vi.fn(),
    restockOrder: vi.fn(),
  };
});

type MockedFn = ReturnType<typeof vi.fn>;

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;
const __prevMonobankGpayEnabled = process.env.SHOP_MONOBANK_GPAY_ENABLED;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_PAYMENTS_ENABLED = 'true';
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'false';
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;

  if (__prevPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
  else process.env.PAYMENTS_ENABLED = __prevPaymentsEnabled;

  if (__prevStripePaymentsEnabled === undefined)
    delete process.env.STRIPE_PAYMENTS_ENABLED;
  else process.env.STRIPE_PAYMENTS_ENABLED = __prevStripePaymentsEnabled;

  if (__prevMonobankGpayEnabled === undefined)
    delete process.env.SHOP_MONOBANK_GPAY_ENABLED;
  else process.env.SHOP_MONOBANK_GPAY_ENABLED = __prevMonobankGpayEnabled;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHOP_MONOBANK_GPAY_ENABLED = 'false';
});

function makeMonobankCheckoutReq(params: {
  idempotencyKey?: string;
  body: Record<string, unknown>;
}) {
  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': 'uk-UA',
    origin: 'http://localhost:3000',
  });

  if (params.idempotencyKey) {
    headers.set('idempotency-key', params.idempotencyKey);
  }

  return new NextRequest(
    new Request('http://localhost:3000/api/shop/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(params.body),
    })
  );
}

function mockCreateOrderSuccess(mockFn: MockedFn, orderId: string) {
  mockFn.mockResolvedValueOnce({
    order: {
      id: orderId,
      currency: 'UAH',
      totalAmount: 10,
      paymentStatus: 'paid',
      paymentProvider: 'none',
      paymentIntentId: null,
    },
    isNew: true,
    totalCents: 1000,
  });
}

describe('checkout monobank parse/validation', () => {
  it('rejects monobank checkout without idempotency key', async () => {
    const res = await POST(
      makeMonobankCheckoutReq({
        body: {
          paymentProvider: 'monobank',
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
        },
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_REQUEST');
    expect(createOrderWithItems).not.toHaveBeenCalled();
  });

  it('ignores client currency/amount fields for monobank payload validation', async () => {
    const createOrderWithItemsMock =
      createOrderWithItems as unknown as MockedFn;
    mockCreateOrderSuccess(createOrderWithItemsMock, 'order_monobank_parse_1');

    const idem = 'mono_idem_validation_0001';
    const res = await POST(
      makeMonobankCheckoutReq({
        idempotencyKey: idem,
        body: {
          paymentProvider: 'monobank',
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
          currency: 'USD',
          amount: 999999,
          amountMinor: 999999,
          totalAmount: 999999,
          totalAmountMinor: 999999,
        },
      })
    );

    expect(res.status).toBe(201);
    expect(createOrderWithItems).toHaveBeenCalledTimes(1);

    const args = createOrderWithItemsMock.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      idempotencyKey: idem,
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_invoice',
    });
    expect(Array.isArray(args?.items)).toBe(true);
  });

  it('defaults stripe method to stripe_card when paymentMethod is omitted', async () => {
    const createOrderWithItemsMock =
      createOrderWithItems as unknown as MockedFn;
    mockCreateOrderSuccess(createOrderWithItemsMock, 'order_stripe_default_1');

    const res = await POST(
      makeMonobankCheckoutReq({
        idempotencyKey: 'stripe_idem_method_0001',
        body: {
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
        },
      })
    );

    expect(res.status).toBe(201);
    const args = createOrderWithItemsMock.mock.calls[0]?.[0];
    expect(args?.paymentProvider).toBeUndefined();
    expect(args?.paymentMethod).toBe('stripe_card');
  });

  it('rejects incompatible provider/method pair', async () => {
    const res = await POST(
      makeMonobankCheckoutReq({
        idempotencyKey: 'mono_idem_invalid_method_0001',
        body: {
          paymentProvider: 'monobank',
          paymentMethod: 'stripe_card',
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
        },
      })
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('INVALID_REQUEST');
    expect(createOrderWithItems).not.toHaveBeenCalled();
  });

  it('enforces SHOP_MONOBANK_GPAY_ENABLED for monobank_google_pay', async () => {
    const disabled = await POST(
      makeMonobankCheckoutReq({
        idempotencyKey: 'mono_gpay_disabled_0001',
        body: {
          paymentProvider: 'monobank',
          paymentMethod: 'monobank_google_pay',
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
        },
      })
    );

    expect(disabled.status).toBe(422);
    const disabledJson = await disabled.json();
    expect(disabledJson.code).toBe('INVALID_REQUEST');

    process.env.SHOP_MONOBANK_GPAY_ENABLED = 'true';
    const createOrderWithItemsMock =
      createOrderWithItems as unknown as MockedFn;
    mockCreateOrderSuccess(createOrderWithItemsMock, 'order_monobank_gpay_1');

    const enabled = await POST(
      makeMonobankCheckoutReq({
        idempotencyKey: 'mono_gpay_enabled_0001',
        body: {
          paymentProvider: 'monobank',
          paymentMethod: 'monobank_google_pay',
          items: [
            { productId: '11111111-1111-4111-8111-111111111111', quantity: 1 },
          ],
        },
      })
    );

    expect(enabled.status).toBe(201);
    const args = createOrderWithItemsMock.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      paymentProvider: 'monobank',
      paymentMethod: 'monobank_google_pay',
    });
  });
});
