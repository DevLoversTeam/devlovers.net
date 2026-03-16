import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCheckoutSuccessOrderSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/services/orders', () => ({
  getCheckoutSuccessOrderSummary: (args: unknown) =>
    getCheckoutSuccessOrderSummaryMock(args),
}));

vi.mock('@/components/shop/ClearCartOnMount', () => ({
  ClearCartOnMount: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

vi.mock('@/app/[locale]/shop/checkout/success/MonobankRedirectStatus', () => ({
  default: () => null,
}));

vi.mock('@/app/[locale]/shop/checkout/success/OrderStatusAutoRefresh', () => ({
  default: () => null,
}));

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function makePageArgs(searchParams: Record<string, string>) {
  return {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  };
}

describe('checkout success page access gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not load order summary for unauthorized orderId query access', async () => {
    getCheckoutSuccessOrderSummaryMock.mockResolvedValue({
      ok: false,
      code: 'STATUS_TOKEN_REQUIRED',
      status: 401,
    });

    const mod = await import('@/app/[locale]/shop/checkout/success/page');
    await mod.default(makePageArgs({ orderId: ORDER_ID }));

    expect(getCheckoutSuccessOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: null,
    });
  });

  it('loads summary only when access is authorized by session/token model', async () => {
    getCheckoutSuccessOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: {
        id: ORDER_ID,
        totalAmountMinor: 1000,
        currency: 'UAH',
        paymentStatus: 'paid',
        items: [],
      },
    });

    const mod = await import('@/app/[locale]/shop/checkout/success/page');
    await mod.default(
      makePageArgs({ orderId: ORDER_ID, statusToken: 'token_test' })
    );

    expect(getCheckoutSuccessOrderSummaryMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      statusToken: 'token_test',
    });
  });

  it('keeps monobank flow on redirect status component path', async () => {
    getCheckoutSuccessOrderSummaryMock.mockResolvedValue({
      ok: true,
      order: {
        id: ORDER_ID,
        totalAmountMinor: 1000,
        currency: 'UAH',
        paymentStatus: 'pending',
        items: [],
      },
    });

    const mod = await import('@/app/[locale]/shop/checkout/success/page');
    await mod.default(
      makePageArgs({
        orderId: ORDER_ID,
        flow: 'monobank',
        statusToken: 'token_test',
      })
    );

    expect(getCheckoutSuccessOrderSummaryMock).not.toHaveBeenCalled();
  });
});
