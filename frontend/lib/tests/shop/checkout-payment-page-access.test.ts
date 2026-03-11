import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCheckoutPaymentPageOrderSummaryMock = vi.hoisted(() => vi.fn());
const ensureStripePaymentIntentForOrderMock = vi.hoisted(() => vi.fn());
const isStripePaymentsEnabledMock = vi.hoisted(() =>
  vi.fn((_args?: unknown) => true)
);

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/services/orders', () => ({
  getCheckoutPaymentPageOrderSummary: (args: unknown) =>
    getCheckoutPaymentPageOrderSummaryMock(args),
}));

vi.mock('@/lib/services/orders/payment-attempts', () => ({
  ensureStripePaymentIntentForOrder: (args: unknown) =>
    ensureStripePaymentIntentForOrderMock(args),
}));

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: (args?: unknown) => isStripePaymentsEnabledMock(args),
  getStripeEnv: vi.fn(() => ({
    paymentsEnabled: true,
    publishableKey: 'pk_test_123',
    secretKey: 'sk_test_123',
    webhookSecret: 'whsec_test_123',
    mode: 'test',
  })),
}));

vi.mock('@/components/shop/ClearCartOnMount', () => ({
  ClearCartOnMount: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/app/[locale]/shop/checkout/payment/StripePaymentClient', () => ({
  default: () => null,
}));

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function makePageArgs(searchParams?: Record<string, string>) {
  return {
    params: Promise.resolve({ locale: 'en', orderId: ORDER_ID }),
    searchParams: Promise.resolve(searchParams ?? {}),
  };
}

function authorizedOrder() {
  return {
    id: ORDER_ID,
    currency: 'USD',
    totalAmount: 49.99,
    totalAmountMinor: 4999,
    paymentStatus: 'pending',
    paymentProvider: 'stripe',
    paymentIntentId: null,
    items: [],
  };
}

describe('checkout stripe payment page access gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    isStripePaymentsEnabledMock.mockReturnValue(true);

    ensureStripePaymentIntentForOrderMock.mockResolvedValue({
      paymentIntentId: 'pi_test_123',
      clientSecret: 'cs_test_123',
      attemptId: 'attempt_test_123',
      attemptNumber: 1,
    });
  });

  it('denies direct orderId access when authorization is missing', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: false,
      code: 'STATUS_TOKEN_REQUIRED',
      status: 401,
    });

    const mod =
      await import('@/app/[locale]/shop/checkout/payment/[orderId]/page');
    await mod.default(makePageArgs());

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: null,
    });
    expect(ensureStripePaymentIntentForOrderMock).not.toHaveBeenCalled();
  });

  it('allows access with valid payment-init status token', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: authorizedOrder(),
    });

    const mod =
      await import('@/app/[locale]/shop/checkout/payment/[orderId]/page');
    await mod.default(makePageArgs({ statusToken: 'token_payment_init' }));

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: 'token_payment_init',
    });
    expect(ensureStripePaymentIntentForOrderMock).toHaveBeenCalledTimes(1);
  });

  it('allows access when session model authorizes without status token', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: authorizedOrder(),
    });

    const mod =
      await import('@/app/[locale]/shop/checkout/payment/[orderId]/page');
    await mod.default(makePageArgs());

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: null,
    });
    expect(ensureStripePaymentIntentForOrderMock).toHaveBeenCalledTimes(1);
  });

  it('does not initialize stripe when canonical capability is false', async () => {
    isStripePaymentsEnabledMock.mockReturnValue(false);
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: authorizedOrder(),
    });

    const mod =
      await import('@/app/[locale]/shop/checkout/payment/[orderId]/page');
    await mod.default(makePageArgs());

    expect(isStripePaymentsEnabledMock).toHaveBeenCalledWith({
      requirePublishableKey: true,
      respectStripePaymentsFlag: true,
    });
    expect(ensureStripePaymentIntentForOrderMock).not.toHaveBeenCalled();
  });
});
