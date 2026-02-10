import { describe, expect, it, vi } from 'vitest';

import { __test__ } from '@/lib/services/orders/monobank';

describe('monobank attempt lifecycle (D)', () => {
  it('stale creating without pageUrl: marks attempt failed and does not cancel order; allows new attempt', async () => {
    const createMonoAttemptAndInvoiceImpl =
      __test__.createMonoAttemptAndInvoiceImpl;

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

      getActiveAttempt: vi.fn(async () => ({
        id: 'attempt-old',
        provider: 'monobank',
        status: 'creating',
        providerPaymentIntentId: null,
        metadata: {},
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
      createCreatingAttempt: vi.fn(async () => ({
        id: 'attempt-new',
        provider: 'monobank',
        status: 'creating',
        providerPaymentIntentId: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),
      createMonobankInvoice: vi.fn(async () => ({
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.example/1',
      })),
      finalizeAttemptWithInvoice: vi.fn(async () => undefined),
    } as any;

    const res = await createMonoAttemptAndInvoiceImpl(deps, {
      orderId: 'order_1',
      requestId: 'req_1',
      redirectUrl: 'https://example/success',
      webhookUrl: 'https://example/webhook',
    });

    expect(deps.markAttemptFailed).toHaveBeenCalledTimes(1);
    expect(deps.cancelOrderAndRelease).not.toHaveBeenCalled();
    expect(deps.createCreatingAttempt).toHaveBeenCalledTimes(1);
    expect(deps.createMonobankInvoice).toHaveBeenCalledTimes(1);
    expect(deps.finalizeAttemptWithInvoice).toHaveBeenCalledTimes(1);

    expect(res.attemptId).toBe('attempt-new');
    expect(res.invoiceId).toBe('inv_1');
    expect(res.pageUrl).toBe('https://pay.example/1');
  });
});
