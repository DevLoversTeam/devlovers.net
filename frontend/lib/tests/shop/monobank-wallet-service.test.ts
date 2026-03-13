import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: new Proxy(
    {},
    {
      get() {
        throw new Error('[unit-test] DB access is not allowed here');
      },
    }
  ),
}));

import { PspError } from '@/lib/psp/monobank';
import {
  __test__,
  MonobankWalletConflictError,
} from '@/lib/services/orders/monobank-wallet';

describe('monobank wallet orchestration (unit, no DB)', () => {
  const baseOrder = {
    id: 'order_1',
    paymentProvider: 'monobank',
    paymentStatus: 'pending',
    currency: 'UAH',
    totalAmountMinor: 1250,
  };

  const creatingAttempt = {
    id: 'attempt_1',
    orderId: 'order_1',
    provider: 'monobank',
    status: 'creating',
    attemptNumber: 1,
    idempotencyKey: 'idem-1',
    providerPaymentIntentId: null,
    providerModifiedAt: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    finalizedAt: null,
    currency: 'UAH',
    expectedAmountMinor: 1250,
    checkoutUrl: null,
    providerCreatedAt: null,
    janitorClaimedUntil: null,
    janitorClaimedBy: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };

  it('same order + same idempotency key returns same result and skips PSP call', async () => {
    const deps = {
      readWalletOrder: vi.fn(async () => baseOrder),
      findAttemptByIdempotencyKey: vi.fn(async () => ({
        ...creatingAttempt,
        status: 'active',
        providerPaymentIntentId: 'invoice_1',
        metadata: {
          wallet: {
            submitOutcome: 'submitted',
            syncStatus: 'created',
            redirectUrl: 'https://pay.test/3ds',
          },
        },
      })),
      findActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => creatingAttempt),
      persistAttemptSubmitted: vi.fn(async () => undefined),
      persistAttemptUnknown: vi.fn(async () => undefined),
      persistAttemptRejected: vi.fn(async () => undefined),
      walletPayment: vi.fn(async () => {
        throw new Error('should not be called');
      }),
    };

    const result = await __test__.submitMonobankWalletPaymentImpl(deps as any, {
      orderId: 'order_1',
      idempotencyKey: 'idem-1',
      cardToken: 'token',
      redirectUrl: 'https://shop.test/return',
      webHookUrl: 'https://shop.test/webhook',
    });

    expect(result.reused).toBe(true);
    expect(result.invoiceId).toBe('invoice_1');
    expect(result.redirectUrl).toBe('https://pay.test/3ds');
    expect(deps.walletPayment).not.toHaveBeenCalled();
  });

  it('concurrent different idempotency key for active attempt throws typed conflict', async () => {
    const deps = {
      readWalletOrder: vi.fn(async () => baseOrder),
      findAttemptByIdempotencyKey: vi.fn(async () => null),
      findActiveAttempt: vi.fn(async () => ({
        ...creatingAttempt,
        idempotencyKey: 'active-key',
      })),
      createCreatingAttempt: vi.fn(async () => creatingAttempt),
      persistAttemptSubmitted: vi.fn(async () => undefined),
      persistAttemptUnknown: vi.fn(async () => undefined),
      persistAttemptRejected: vi.fn(async () => undefined),
      walletPayment: vi.fn(async () => ({}) as any),
    };

    await expect(
      __test__.submitMonobankWalletPaymentImpl(deps as any, {
        orderId: 'order_1',
        idempotencyKey: 'new-key',
        cardToken: 'token',
        redirectUrl: 'https://shop.test/return',
        webHookUrl: 'https://shop.test/webhook',
      })
    ).rejects.toBeInstanceOf(MonobankWalletConflictError);

    expect(deps.walletPayment).not.toHaveBeenCalled();
  });

  it('timeout/upstream path returns unknown and does not retry', async () => {
    const deps = {
      readWalletOrder: vi.fn(async () => baseOrder),
      findAttemptByIdempotencyKey: vi.fn(async () => null),
      findActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => creatingAttempt),
      persistAttemptSubmitted: vi.fn(async () => undefined),
      persistAttemptUnknown: vi.fn(async () => undefined),
      persistAttemptRejected: vi.fn(async () => undefined),
      walletPayment: vi.fn(async () => {
        throw new PspError('PSP_TIMEOUT', 'timeout');
      }),
    };

    const result = await __test__.submitMonobankWalletPaymentImpl(deps as any, {
      orderId: 'order_1',
      idempotencyKey: 'idem-1',
      cardToken: 'token',
      redirectUrl: 'https://shop.test/return',
      webHookUrl: 'https://shop.test/webhook',
    });

    expect(result.outcome).toBe('unknown');
    expect(result.reused).toBe(false);
    expect(deps.walletPayment).toHaveBeenCalledTimes(1);
    expect(deps.persistAttemptUnknown).toHaveBeenCalledTimes(1);
    expect(deps.persistAttemptRejected).not.toHaveBeenCalled();
  });

  it('4xx PSP error is persisted as rejected and rethrown', async () => {
    const deps = {
      readWalletOrder: vi.fn(async () => baseOrder),
      findAttemptByIdempotencyKey: vi.fn(async () => null),
      findActiveAttempt: vi.fn(async () => null),
      createCreatingAttempt: vi.fn(async () => creatingAttempt),
      persistAttemptSubmitted: vi.fn(async () => undefined),
      persistAttemptUnknown: vi.fn(async () => undefined),
      persistAttemptRejected: vi.fn(async () => undefined),
      walletPayment: vi.fn(async () => {
        throw new PspError('PSP_BAD_REQUEST', 'bad request');
      }),
    };

    await expect(
      __test__.submitMonobankWalletPaymentImpl(deps as any, {
        orderId: 'order_1',
        idempotencyKey: 'idem-1',
        cardToken: 'token',
        redirectUrl: 'https://shop.test/return',
        webHookUrl: 'https://shop.test/webhook',
      })
    ).rejects.toBeInstanceOf(PspError);

    expect(deps.walletPayment).toHaveBeenCalledTimes(1);
    expect(deps.persistAttemptRejected).toHaveBeenCalledTimes(1);
    expect(deps.persistAttemptUnknown).not.toHaveBeenCalled();
  });
});
