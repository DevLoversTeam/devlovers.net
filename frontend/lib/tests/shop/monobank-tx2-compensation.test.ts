import { beforeEach, describe, expect, it, vi } from 'vitest';

import { orders, paymentAttempts } from '@/db/schema';
import { cancelMonobankInvoice } from '@/lib/psp/monobank';
import { PspInvoicePersistError } from '@/lib/services/errors';
import { restockOrder } from '@/lib/services/orders/restock';

const updateCalls: Array<{ table: unknown; values: Record<string, unknown> }> =
  [];

const selectMock = vi.fn(() => ({
  from: () => ({
    where: () => ({
      limit: async () => [{ metadata: {} }],
    }),
  }),
}));

function makeUpdateQuery<T>(rows: T[]) {
  const p = Promise.resolve(rows);
  return Object.assign(p, { returning: async () => rows });
}

const updateMock = vi.fn((table: unknown) => ({
  set: (values: Record<string, unknown>) => {
    updateCalls.push({ table, values });

    if (table === orders && 'pspChargeId' in values) {
      throw new Error('UPDATE_FAIL');
    }

    const rows =
      table === paymentAttempts
        ? [{ id: 'attempt-1' }]
        : table === orders && (values as any).status === 'CANCELED'
          ? [{ id: 'order-1' }]
          : [];

    return {
      where: () => makeUpdateQuery(rows),
    };
  },
}));

const transactionMock = vi.fn(async (fn: any) => {
  return await fn({ select: selectMock, update: updateMock });
});

const dbMock = {
  transaction: transactionMock,
  select: selectMock,
  update: updateMock,
};

vi.mock('@/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/logging', () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('@/lib/psp/monobank', () => ({
  MONO_CURRENCY: 'UAH',
  createMonobankInvoice: vi.fn(async () => ({
    invoiceId: 'inv-mock',
    pageUrl: 'https://pay.test/inv-mock',
    raw: {},
  })),
  cancelMonobankInvoice: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/orders/restock', () => ({
  restockOrder: vi.fn(async () => {}),
}));

beforeEach(() => {
  updateCalls.length = 0;
  vi.clearAllMocks();
});

describe('finalizeAttemptWithInvoice compensation', () => {
  it('cancels invoice + order + restocks when Tx#2 persistence fails', async () => {
    const { __test__ } = await import('@/lib/services/orders/monobank');

    await expect(
      __test__.finalizeAttemptWithInvoice({
        attemptId: 'attempt-1',
        orderId: 'order-1',
        invoiceId: 'inv-1',
        pageUrl: 'https://pay.test/inv-1',
        requestId: 'req-1',
      })
    ).rejects.toBeInstanceOf(PspInvoicePersistError);

    expect(cancelMonobankInvoice).toHaveBeenCalledTimes(1);
    expect(cancelMonobankInvoice).toHaveBeenCalledWith('inv-1');

    expect(restockOrder).toHaveBeenCalledTimes(1);
    expect(restockOrder).toHaveBeenCalledWith('order-1', {
      reason: 'canceled',
      workerId: 'monobank',
    });

    const canceledOrderUpdate = updateCalls.find(
      c => c.table === orders && (c.values as any).status === 'CANCELED'
    );
    expect(canceledOrderUpdate).toBeTruthy();

    const failedAttemptUpdate = updateCalls.find(
      c => c.table === paymentAttempts && (c.values as any).status === 'failed'
    );
    expect(failedAttemptUpdate).toBeTruthy();
    expect((failedAttemptUpdate?.values as any).lastErrorCode).toBe(
      'PSP_INVOICE_PERSIST_FAILED'
    );
  });
});
