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

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: () => true,
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
import {
  IdempotencyConflictError,
  InsufficientStockError,
  InvalidPayloadError,
  InvalidVariantError,
  PriceConfigError,
} from '@/lib/services/errors';
import { createOrderWithItems } from '@/lib/services/orders';

type MockedFn = ReturnType<typeof vi.fn>;

const createOrderWithItemsMock = createOrderWithItems as unknown as MockedFn;

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_PAYMENTS_ENABLED = 'true';
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
});

beforeEach(() => {
  vi.clearAllMocks();
  createOrderWithItemsMock.mockReset();
});

describe('checkout route validation/business error contract', () => {
  it('returns 422 INVALID_PAYLOAD for schema-level invalid checkout payload', async () => {
    const response = await POST(
      makeCheckoutReq({
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
    const response = await POST(
      makeCheckoutReq({
        idempotencyKey: 'checkout_legal_consent_0001',
        legalConsent: null,
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('LEGAL_CONSENT_REQUIRED');
    expect(createOrderWithItemsMock).not.toHaveBeenCalled();
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
      makeCheckoutReq({ idempotencyKey: 'checkout_invalid_variant_0001' })
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
      makeCheckoutReq({
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
      makeCheckoutReq({ idempotencyKey: 'checkout_unexpected_error_0001' })
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.code).toBe('INTERNAL_ERROR');
  });
});
