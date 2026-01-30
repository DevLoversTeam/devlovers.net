import { describe, it, expect, vi } from 'vitest';

// E2 flow map (exact names + paths):
// - Route: POST `frontend/app/api/shop/checkout/route.ts`
// - Service: `createMonoAttemptAndInvoice` + `createMonobankAttemptAndInvoice`
//   in `frontend/lib/services/orders/monobank.ts`
// - Tx#1 attempt insert: `createCreatingAttempt` (same file)
// - PSP call: `createMonobankInvoice` (`frontend/lib/psp/monobank.ts`)
// - Tx#2 finalize: `finalizeAttemptWithInvoice` (same file)
// - Cancel + restock: `cancelOrderAndRelease` (same file)

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { __test__ } from '@/lib/services/orders/monobank';
import {
  PspUnavailableError,
  PspInvoicePersistError,
} from '@/lib/services/errors';

describe('createMonoAttemptAndInvoice (unit, no DB)', () => {
  const baseArgs = {
    orderId: 'order_1',
    requestId: 'req_1',
    redirectUrl: 'https://shop.test/redirect',
    webhookUrl: 'https://shop.test/api/shop/webhooks/monobank',
    maxAttempts: 3,
  };

  function snapshot() {
    return {
      amountMinor: 1234,
      currency: 'UAH',
      items: [
        {
          productId: 'p1',
          title: 'Item',
          quantity: 1,
          unitPriceMinor: 1234,
          lineTotalMinor: 1234,
        },
      ],
    };
  }

  it('success: creates invoice and finalizes attempt', async () => {
    const deps = {
      getActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => ({
        id: 'attempt_1',
        attemptNumber: 1,
        providerPaymentIntentId: null,
        metadata: null,
      })),
      readMonobankInvoiceParams: vi.fn(async () => snapshot()),
      createMonobankInvoice: vi.fn(async () => ({
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.test/inv_1',
        raw: {},
      })),
      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),
      finalizeAttemptWithInvoice: vi.fn(async () => undefined),
    };

    const res = await __test__.createMonoAttemptAndInvoiceImpl(
      deps as any,
      baseArgs
    );

    expect(res.attemptId).toBe('attempt_1');
    expect(res.invoiceId).toBe('inv_1');
    expect(res.pageUrl).toBe('https://pay.test/inv_1');

    expect(deps.createMonobankInvoice).toHaveBeenCalledTimes(1);
    const call = (deps.createMonobankInvoice as any).mock.calls[0][0];
    expect(call.redirectUrl).toBe(baseArgs.redirectUrl);
    expect(call.webhookUrl).toBe(baseArgs.webhookUrl);
    expect(call.merchantPaymInfo.reference).toBe('attempt_1');

    expect(deps.finalizeAttemptWithInvoice).toHaveBeenCalledTimes(1);
  });

  it('idempotency: returns existing invoice without PSP call', async () => {
    const deps = {
      getActiveAttempt: vi.fn(async () => ({
        id: 'attempt_1',
        attemptNumber: 1,
        providerPaymentIntentId: 'inv_1',
        metadata: { pageUrl: 'https://pay.test/inv_1' },
      })),
      createCreatingAttempt: vi.fn(),
      readMonobankInvoiceParams: vi.fn(),
      createMonobankInvoice: vi.fn(),
      markAttemptFailed: vi.fn(),
      cancelOrderAndRelease: vi.fn(),
      finalizeAttemptWithInvoice: vi.fn(),
    };

    const res = await __test__.createMonoAttemptAndInvoiceImpl(
      deps as any,
      baseArgs
    );

    expect(res.attemptId).toBe('attempt_1');
    expect(res.invoiceId).toBe('inv_1');
    expect(res.pageUrl).toBe('https://pay.test/inv_1');
    expect(deps.createMonobankInvoice).not.toHaveBeenCalled();
    expect(deps.createCreatingAttempt).not.toHaveBeenCalled();
  });

  it('idempotency: second call reuses first invoice (PSP called once)', async () => {
    const state = {
      attempt: null as null | {
        id: string;
        attemptNumber: number;
        providerPaymentIntentId: string | null;
        metadata: Record<string, unknown> | null;
      },
    };

    const deps = {
      getActiveAttempt: vi.fn(async () => state.attempt),
      createCreatingAttempt: vi.fn(async () => {
        state.attempt = {
          id: 'attempt_1',
          attemptNumber: 1,
          providerPaymentIntentId: null,
          metadata: null,
        };
        return state.attempt;
      }),
      readMonobankInvoiceParams: vi.fn(async () => snapshot()),
      createMonobankInvoice: vi.fn(async () => ({
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.test/inv_1',
        raw: {},
      })),
      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),
      finalizeAttemptWithInvoice: vi.fn(async args => {
        if (state.attempt && state.attempt.id === args.attemptId) {
          state.attempt.providerPaymentIntentId = args.invoiceId;
          state.attempt.metadata = { pageUrl: args.pageUrl };
        }
      }),
    };

    const first = await __test__.createMonoAttemptAndInvoiceImpl(
      deps as any,
      baseArgs
    );
    const second = await __test__.createMonoAttemptAndInvoiceImpl(
      deps as any,
      baseArgs
    );

    expect(first.pageUrl).toBe('https://pay.test/inv_1');
    expect(second.pageUrl).toBe('https://pay.test/inv_1');
    expect(first.invoiceId).toBe('inv_1');
    expect(second.invoiceId).toBe('inv_1');
    expect(deps.createMonobankInvoice).toHaveBeenCalledTimes(1);
    expect(deps.createCreatingAttempt).toHaveBeenCalledTimes(1);
  });

  it('fail-closed: PSP error -> attempt failed + order canceled + 503 error type', async () => {
    const deps = {
      getActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => ({
        id: 'attempt_1',
        attemptNumber: 1,
        providerPaymentIntentId: null,
        metadata: null,
      })),
      readMonobankInvoiceParams: vi.fn(async () => snapshot()),
      createMonobankInvoice: vi.fn(async () => {
        const err: any = new Error('timeout');
        err.code = 'PSP_TIMEOUT';
        throw err;
      }),
      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),
      finalizeAttemptWithInvoice: vi.fn(async () => undefined),
    };

    await expect(
      __test__.createMonoAttemptAndInvoiceImpl(deps as any, baseArgs)
    ).rejects.toBeInstanceOf(PspUnavailableError);

    expect(deps.markAttemptFailed).toHaveBeenCalledTimes(1);
    expect(deps.cancelOrderAndRelease).toHaveBeenCalledTimes(1);
  });

  it('tx2 failure after PSP success: propagates persist error', async () => {
    const deps = {
      getActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => ({
        id: 'attempt_1',
        attemptNumber: 1,
        providerPaymentIntentId: null,
        metadata: null,
      })),
      readMonobankInvoiceParams: vi.fn(async () => snapshot()),
      createMonobankInvoice: vi.fn(async () => ({
        invoiceId: 'inv_1',
        pageUrl: 'https://pay.test/inv_1',
        raw: {},
      })),
      markAttemptFailed: vi.fn(async () => undefined),
      cancelOrderAndRelease: vi.fn(async () => undefined),
      finalizeAttemptWithInvoice: vi.fn(async () => {
        throw new PspInvoicePersistError('persist failed', {
          orderId: 'order_1',
        });
      }),
    };

    await expect(
      __test__.createMonoAttemptAndInvoiceImpl(deps as any, baseArgs)
    ).rejects.toBeInstanceOf(PspInvoicePersistError);
  });
});
