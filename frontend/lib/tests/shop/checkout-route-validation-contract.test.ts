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

import { createTestLegalConsent } from '@/lib/tests/shop/test-legal-consent';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/shop/commercial-policy.server', () => ({
  resolveStandardStorefrontProviderCapabilities: vi.fn(() => ({
    stripeCheckoutEnabled: true,
    monobankCheckoutEnabled: true,
    monobankGooglePayEnabled: false,
    enabledProviders: ['monobank', 'stripe'],
  })),
}));

vi.mock('@/lib/env/stripe', async () => {
  const actual = await vi.importActual<any>('@/lib/env/stripe');
  return {
    ...actual,
    isPaymentsEnabled: () => true,
  };
});

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
import { getCurrentUser } from '@/lib/auth';
import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  PriceConfigError,
} from '@/lib/services/errors';
import { createOrderWithItems } from '@/lib/services/orders';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';

type MockedFn = ReturnType<typeof vi.fn>;

const createOrderWithItemsMock = createOrderWithItems as unknown as MockedFn;
const ensureStripePaymentIntentForOrderMock =
  ensureStripePaymentIntentForOrder as unknown as MockedFn;
const getCurrentUserMock = getCurrentUser as unknown as MockedFn;

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;
const __prevStripeSecret = process.env.STRIPE_SECRET_KEY;
const __prevStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const __prevStripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_validation_contract';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_checkout_validation_contract';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
    'pk_test_checkout_validation_contract';
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

  if (__prevStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = __prevStripeSecret;

  if (__prevStripeWebhookSecret === undefined)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = __prevStripeWebhookSecret;

  if (__prevStripePublishableKey === undefined)
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = __prevStripePublishableKey;
});

beforeEach(() => {
  vi.clearAllMocks();
  createOrderWithItemsMock.mockReset();
  ensureStripePaymentIntentForOrderMock.mockReset();
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(null);
});

function makeValidationCheckoutReq(params: {
  idempotencyKey: string;
  items?: Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }>;
  legalConsent?: Record<string, unknown> | null;
  paymentProvider?: 'stripe' | 'monobank';
  paymentMethod?: 'stripe_card' | 'monobank_invoice';
}) {
  const paymentProvider = params.paymentProvider ?? 'stripe';
  const paymentMethod = params.paymentMethod ?? 'stripe_card';

  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': 'en',
    'idempotency-key': params.idempotencyKey,
    'x-forwarded-for': '198.51.100.10',
    'x-real-ip': '198.51.100.10',
    origin: 'http://localhost:3000',
  });

  return new NextRequest(
    new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: params.items ?? [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 1,
          },
        ],
        ...(params.legalConsent === null
          ? {}
          : { legalConsent: params.legalConsent ?? createTestLegalConsent() }),
        paymentProvider,
        paymentMethod,
      }),
    })
  );
}

describe('checkout route validation/business error contract', () => {
  it('returns 422 INVALID_PAYLOAD for schema-level invalid checkout payload', async () => {
    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_invalid_payload_0001',
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 0,
          },
        ],
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('INVALID_PAYLOAD');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it('returns 422 LEGAL_CONSENT_REQUIRED when explicit consent is missing', async () => {
    createOrderWithItemsMock.mockRejectedValueOnce(
      new InvalidPayloadError(
        'Explicit legal consent is required before checkout.',
        {
          code: 'LEGAL_CONSENT_REQUIRED',
        }
      )
    );

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_legal_consent_0001',
        legalConsent: null,
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('LEGAL_CONSENT_REQUIRED');
    expect(createOrderWithItemsMock).toHaveBeenCalledTimes(1);
  });

  it('returns 422 INVALID_VARIANT for service-level variant rejection', async () => {
    createOrderWithItemsMock.mockRejectedValueOnce(
      new InvalidVariantError('Invalid size.', {
        productId: '11111111-1111-4111-8111-111111111111',
        field: 'selectedSize',
        value: 'XXL',
        allowed: ['S', 'M', 'L'],
      })
    );

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_invalid_variant_0001',
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('INVALID_VARIANT');
    expect(json.details).toMatchObject({
      productId: '11111111-1111-4111-8111-111111111111',
      field: 'selectedSize',
      value: 'XXL',
      allowed: ['S', 'M', 'L'],
    });
  });

  it.each([
    [
      'PRICE_CONFIG_ERROR',
      new PriceConfigError('Missing UAH price.', {
        productId: '11111111-1111-4111-8111-111111111111',
        currency: 'UAH',
      }),
    ],
    [
      'CHECKOUT_PRICE_CHANGED',
      new InvalidPayloadError(
        'Prices changed. Refresh your cart and try again.',
        {
          code: 'CHECKOUT_PRICE_CHANGED',
          details: { reason: 'PRICING_FINGERPRINT_MISMATCH' },
        }
      ),
    ],
    [
      'CHECKOUT_SHIPPING_CHANGED',
      new InvalidPayloadError(
        'Shipping amount changed. Refresh your cart and try again.',
        {
          code: 'CHECKOUT_SHIPPING_CHANGED',
          details: { reason: 'SHIPPING_QUOTE_FINGERPRINT_MISMATCH' },
        }
      ),
    ],
    [
      'TERMS_VERSION_MISMATCH',
      new InvalidPayloadError(
        'Submitted terms version does not match current terms.',
        {
          code: 'TERMS_VERSION_MISMATCH',
        }
      ),
    ],
    [
      'PRIVACY_VERSION_MISMATCH',
      new InvalidPayloadError(
        'Submitted privacy version does not match current privacy policy.',
        {
          code: 'PRIVACY_VERSION_MISMATCH',
        }
      ),
    ],
    ['INSUFFICIENT_STOCK', new InsufficientStockError('Insufficient stock.')],
    [
      'IDEMPOTENCY_CONFLICT',
      new IdempotencyConflictError(
        'Idempotency key reuse with different payload.',
        {
          existingOrderId: 'order_existing_0001',
        }
      ),
    ],
  ])('returns 422 for %s', async (expectedCode, error) => {
    createOrderWithItemsMock.mockRejectedValueOnce(error);

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: `checkout_${String(expectedCode).toLowerCase()}_0001`,
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe(expectedCode);
  });

  it('returns 500 INTERNAL_ERROR for unexpected runtime failure', async () => {
    createOrderWithItemsMock.mockRejectedValueOnce(
      new Error('unexpected checkout failure')
    );

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_unexpected_error_0001',
      })
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.code).toBe('INTERNAL_ERROR');
  });

  it('preserves structured PriceConfigError details for monobank checkout errors', async () => {
    createOrderWithItemsMock.mockRejectedValueOnce(
      new PriceConfigError('Missing UAH price.', {
        productId: '11111111-1111-4111-8111-111111111111',
        currency: 'UAH',
      })
    );

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_monobank_price_config_0001',
        paymentProvider: 'monobank',
        paymentMethod: 'monobank_invoice',
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('PRICE_CONFIG_ERROR');
    expect(json.details).toMatchObject({
      productId: '11111111-1111-4111-8111-111111111111',
      currency: 'UAH',
    });
  });

  it('preserves structured idempotency conflict details for monobank checkout errors', async () => {
    createOrderWithItemsMock.mockRejectedValueOnce(
      new IdempotencyConflictError(
        'Idempotency key reuse with different payload.',
        {
          existingOrderId: 'order_existing_0001',
        }
      )
    );

    const response = await POST(
      makeValidationCheckoutReq({
        idempotencyKey: 'checkout_monobank_idempotency_conflict_0001',
        paymentProvider: 'monobank',
        paymentMethod: 'monobank_invoice',
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('CHECKOUT_IDEMPOTENCY_CONFLICT');
    expect(json.details).toMatchObject({
      existingOrderId: 'order_existing_0001',
    });
  });

  it.each([
    ['OUT_OF_STOCK', 'checkout_monobank_out_of_stock_0001'],
    ['INSUFFICIENT_STOCK', 'checkout_monobank_insufficient_stock_0001'],
  ] as const)(
    'normalizes Monobank stock error %s to 422 INSUFFICIENT_STOCK before generic code mapping',
    async (code, idempotencyKey) => {
      createOrderWithItemsMock.mockRejectedValueOnce(
        Object.assign(new Error('Insufficient stock.'), {
          code,
        })
      );

      const response = await POST(
        makeValidationCheckoutReq({
          idempotencyKey,
          paymentProvider: 'monobank',
          paymentMethod: 'monobank_invoice',
        })
      );

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe('INSUFFICIENT_STOCK');
    }
  );

  it.each([
    ['OUT_OF_STOCK', 'checkout_business_out_of_stock_0001'],
    ['INSUFFICIENT_STOCK', 'checkout_business_insufficient_stock_0001'],
  ] as const)(
    'returns 422 INSUFFICIENT_STOCK for business-code stock error %s outside the typed stock exception path',
    async (code, idempotencyKey) => {
      createOrderWithItemsMock.mockRejectedValueOnce(
        Object.assign(new Error('Insufficient stock.'), {
          code,
        })
      );

      const response = await POST(
        makeValidationCheckoutReq({
          idempotencyKey,
        })
      );

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe('INSUFFICIENT_STOCK');
    }
  );
});

function makeRouteCheckoutReq(params: {
  idempotencyKey?: string;
  paymentProvider?: 'stripe' | 'monobank';
  paymentMethod?: 'stripe_card' | 'monobank_invoice';
  userId?: string;
}) {
  const paymentProvider = params.paymentProvider ?? 'stripe';
  const paymentMethod = params.paymentMethod ?? 'stripe_card';

  const headers = new Headers({
    'content-type': 'application/json',
    'accept-language': 'uk-UA',
    origin: 'http://localhost:3000',
  });

  if (params.idempotencyKey !== undefined) {
    headers.set('idempotency-key', params.idempotencyKey);
  }

  return new NextRequest(
    new Request('http://localhost:3000/api/shop/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 1,
          },
        ],
        legalConsent: createTestLegalConsent(),
        paymentProvider,
        paymentMethod,
        ...(params.userId ? { userId: params.userId } : {}),
      }),
    })
  );
}

function mockSuccessfulStripeCheckout(args?: { orderId?: string }) {
  const orderId = args?.orderId ?? '11111111-1111-4111-8111-111111111123';

  createOrderWithItemsMock.mockResolvedValueOnce({
    order: {
      id: orderId,
      currency: 'UAH',
      totalAmount: 10,
      paymentStatus: 'pending',
      paymentProvider: 'stripe',
      paymentIntentId: null,
    },
    isNew: true,
    totalCents: 1000,
  });

  ensureStripePaymentIntentForOrderMock.mockResolvedValueOnce({
    paymentIntentId: `pi_test_${orderId}`,
    clientSecret: `cs_test_${orderId}`,
    attemptId: `attempt_${orderId}`,
    attemptNumber: 1,
  });
}

describe('checkout route idempotency and identity contract', () => {
  it('rejects missing idempotency key for standard checkout', async () => {
    const response = await POST(
      makeRouteCheckoutReq({
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('MISSING_IDEMPOTENCY_KEY');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it.each(['short', 'bad key!*', 'a'.repeat(129)])(
    'rejects malformed idempotency key for standard checkout: %s',
    async idempotencyKey => {
      const response = await POST(
        makeRouteCheckoutReq({
          idempotencyKey,
          paymentProvider: 'stripe',
          paymentMethod: 'stripe_card',
        })
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.code).toBe('INVALID_IDEMPOTENCY_KEY');
      expect(createOrderWithItemsMock).not.toHaveBeenCalled();
    }
  );

  it('keeps monobank missing-idempotency behavior on INVALID_REQUEST', async () => {
    const response = await POST(
      makeRouteCheckoutReq({
        paymentProvider: 'monobank',
        paymentMethod: 'monobank_invoice',
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_REQUEST');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it('keeps monobank malformed-idempotency behavior on INVALID_REQUEST', async () => {
    const response = await POST(
      makeRouteCheckoutReq({
        idempotencyKey: 'bad key!*',
        paymentProvider: 'monobank',
        paymentMethod: 'monobank_invoice',
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_REQUEST');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it('rejects guest checkout when payload smuggles userId', async () => {
    const response = await POST(
      makeRouteCheckoutReq({
        idempotencyKey: 'guest_userid_smuggle_0001',
        userId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('USER_ID_NOT_ALLOWED');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it('rejects authenticated checkout when payload userId mismatches session user', async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
    });

    const response = await POST(
      makeRouteCheckoutReq({
        idempotencyKey: 'user_mismatch_checkout_0001',
        userId: '11111111-1111-4111-8111-111111111111',
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('USER_MISMATCH');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
  });

  it('allows authenticated checkout when payload userId matches the session user', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    getCurrentUserMock.mockResolvedValueOnce({ id: userId });
    mockSuccessfulStripeCheckout({
      orderId: '11111111-1111-4111-8111-111111111124',
    });

    const response = await POST(
      makeRouteCheckoutReq({
        idempotencyKey: 'user_match_checkout_0001',
        userId,
      })
    );

    expect(response.status).toBe(201);
    expect(createOrderWithItemsMock).toHaveBeenCalledTimes(1);
    expect(createOrderWithItemsMock.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'user_match_checkout_0001',
      userId,
    });
  });

  it('allows guest checkout when payload omits userId', async () => {
    mockSuccessfulStripeCheckout({
      orderId: '11111111-1111-4111-8111-111111111125',
    });

    const response = await POST(
      makeRouteCheckoutReq({
        idempotencyKey: 'guest_checkout_without_user_0001',
      })
    );

    expect(response.status).toBe(201);
    expect(createOrderWithItemsMock).toHaveBeenCalledTimes(1);
    expect(createOrderWithItemsMock.mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: 'guest_checkout_without_user_0001',
    });
    expect(createOrderWithItemsMock.mock.calls[0]?.[0]?.userId).toBeNull();
  });
});
