import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: unknown }) => children,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: unknown }) => children,
  PaymentElement: () => null,
  useElements: () => null,
  useStripe: () => null,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(),
}));

import { nextRouteForPaymentResult } from '@/app/[locale]/shop/checkout/payment/StripePaymentClient';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const STATUS_TOKEN = 'status_token_abc';

describe('stripe payment client return routing', () => {
  it('keeps succeeded intents routed to checkout success', () => {
    const route = nextRouteForPaymentResult({
      orderId: ORDER_ID,
      statusToken: STATUS_TOKEN,
      status: 'succeeded',
    });

    expect(route).toBe(
      `/shop/checkout/success?orderId=${encodeURIComponent(
        ORDER_ID
      )}&statusToken=${encodeURIComponent(STATUS_TOKEN)}`
    );
  });

  it('routes unknown statuses to checkout error', () => {
    const route = nextRouteForPaymentResult({
      orderId: ORDER_ID,
      statusToken: STATUS_TOKEN,
      status: 'unknown_status',
    });

    expect(route).toBe(
      `/shop/checkout/error?orderId=${encodeURIComponent(
        ORDER_ID
      )}&statusToken=${encodeURIComponent(STATUS_TOKEN)}`
    );
  });

  it('routes missing status to checkout error', () => {
    const route = nextRouteForPaymentResult({
      orderId: ORDER_ID,
      statusToken: STATUS_TOKEN,
      status: null,
    });

    expect(route).toBe(
      `/shop/checkout/error?orderId=${encodeURIComponent(
        ORDER_ID
      )}&statusToken=${encodeURIComponent(STATUS_TOKEN)}`
    );
  });
});
