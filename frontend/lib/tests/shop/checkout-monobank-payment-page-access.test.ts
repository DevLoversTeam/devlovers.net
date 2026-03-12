import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCheckoutPaymentPageOrderSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/services/orders', () => ({
  getCheckoutPaymentPageOrderSummary: (args: unknown) =>
    getCheckoutPaymentPageOrderSummaryMock(args),
}));

vi.mock('@/components/shop/ClearCartOnMount', () => ({
  ClearCartOnMount: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

vi.mock(
  '@/app/[locale]/shop/checkout/payment/monobank/MonobankGooglePayClient',
  () => ({
    default: () => null,
  })
);

const ORDER_ID = '22222222-2222-4222-8222-222222222222';

function makePageArgs(searchParams?: Record<string, string>) {
  return {
    params: Promise.resolve({ locale: 'en', orderId: ORDER_ID }),
    searchParams: Promise.resolve(searchParams ?? {}),
  };
}

function authorizedOrder() {
  return {
    id: ORDER_ID,
    currency: 'UAH',
    totalAmount: 1999,
    totalAmountMinor: 199900,
    paymentStatus: 'pending',
    paymentProvider: 'monobank',
    paymentIntentId: null,
    items: [],
  };
}

describe('checkout monobank payment page access gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('denies direct orderId access when authorization is missing', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: false,
      code: 'STATUS_TOKEN_REQUIRED',
      status: 401,
    });

    const mod = await import(
      '@/app/[locale]/shop/checkout/payment/monobank/[orderId]/page'
    );
    await mod.default(makePageArgs());

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: null,
    });
  });

  it('allows access with valid payment-init status token', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: authorizedOrder(),
    });

    const mod = await import(
      '@/app/[locale]/shop/checkout/payment/monobank/[orderId]/page'
    );
    await mod.default(makePageArgs({ statusToken: 'token_payment_init' }));

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: 'token_payment_init',
    });
  });

  it('allows access when session model authorizes without status token', async () => {
    getCheckoutPaymentPageOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: authorizedOrder(),
    });

    const mod = await import(
      '@/app/[locale]/shop/checkout/payment/monobank/[orderId]/page'
    );
    await mod.default(makePageArgs());

    expect(getCheckoutPaymentPageOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: null,
    });
  });
});
