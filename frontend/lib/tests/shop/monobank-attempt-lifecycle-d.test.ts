import { describe, expect, it, vi } from 'vitest';

import { __test__ } from '@/lib/services/orders/monobank';

describe('monobank attempt lifecycle (D)', () => {
  it('stale creating without pageUrl: marks attempt failed and does not cancel order; allows new attempt', async () => {
    const createMonoAttemptAndInvoiceImpl =
      __test__.createMonoAttemptAndInvoiceImpl;
    type Deps = Parameters<typeof createMonoAttemptAndInvoiceImpl>[0];

    const deps = {
      readMonobankInvoiceParams: vi.fn(async () => ({
        amountMinor: 12345,
        currency: 'UAH',
        items: [
          {
            productId: 'prod_1',
            title: 'Test item',
            quantity: 1,
            unitPriceMinor: 12345,
            lineTotalMinor: 12345,
          },
        ],
      })),

      getActiveAttempt: vi.fn(async (orderId: string) => {
        void orderId;
        return {
          id: 'attempt-old',
          provider: 'monobank',
          status: 'creating',
          providerPaymentIntentId: null,
          metadata: {},
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
      }),

      createCreatingAttempt: vi.fn(async (args: unknown) => {
        void args;
        return {
          id: 'attempt-new',
          provider: 'monobank',
          status: 'creating',
          providerPaymentIntentId: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),

      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),

      createMonobankInvoice: vi.fn(async () => ({
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.example/1',
        raw: {},
      })),

      finalizeAttemptWithInvoice: vi.fn(async () => undefined),
    } as unknown as Deps;

    const input = {
      orderId: 'order_1',
      requestId: 'req_1',
      redirectUrl: 'https://example/success',
      webhookUrl: 'https://example/webhook',
    };

    const res = await createMonoAttemptAndInvoiceImpl(deps, input);

    expect(deps.markAttemptFailed).toHaveBeenCalledTimes(1);
    expect(deps.markAttemptFailed).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'attempt-old' })
    );

    expect(deps.cancelOrderAndRelease).not.toHaveBeenCalled();

    expect(deps.createCreatingAttempt).toHaveBeenCalledTimes(1);
    expect(deps.createMonobankInvoice).toHaveBeenCalledTimes(1);
    expect(deps.createMonobankInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order_1',
        amountMinor: 12345,
        paymentType: 'debit',
        redirectUrl: 'https://example/success',
        webhookUrl: 'https://example/webhook',
        merchantPaymInfo: expect.objectContaining({
          reference: 'attempt-new',
          destination: expect.stringContaining('order_1'),
          basketOrder: expect.arrayContaining([
            expect.objectContaining({
              name: 'Test item',
              qty: 1,
              sum: 12345,
              total: 12345,
            }),
          ]),
        }),
      })
    );

    expect(deps.finalizeAttemptWithInvoice).toHaveBeenCalledTimes(1);
    expect(deps.finalizeAttemptWithInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: 'attempt-new',
        orderId: 'order_1',
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.example/1',
        requestId: 'req_1',
      })
    );

    expect(res.attemptId).toBe('attempt-new');
    expect(res.invoiceId).toBe('inv_1');
    expect(res.pageUrl).toBe('https://pay.example/1');
  });
});
