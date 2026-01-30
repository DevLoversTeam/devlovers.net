import { describe, expect, it } from 'vitest';

import {
  buildMonoMerchantPaymInfoFromSnapshot,
  MonobankMerchantPaymInfoError,
} from '@/lib/psp/monobank/merchant-paym-info';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected error');
  } catch (error) {
    expect(error).toBeInstanceOf(MonobankMerchantPaymInfoError);
    const err = error as MonobankMerchantPaymInfoError;
    expect(err.code).toBe(code);
  }
}

describe('buildMonoMerchantPaymInfoFromSnapshot', () => {
  it('builds merchantPaymInfo for a valid snapshot', () => {
    const result = buildMonoMerchantPaymInfoFromSnapshot({
      reference: 'attempt-1',
      order: {
        id: 'order-12345678',
        currency: 'UAH',
        totalAmountMinor: 3000,
      },
      items: [
        {
          productId: 'prod-1',
          title: 'Hat',
          quantity: 1,
          unitPriceMinor: 1000,
          lineTotalMinor: 1000,
        },
        {
          productId: 'prod-2',
          title: 'Shirt',
          quantity: 2,
          unitPriceMinor: 1000,
          lineTotalMinor: 2000,
        },
      ],
      expectedAmountMinor: 3000,
    });

    expect(result.reference).toBe('attempt-1');
    expect(result.destination).toMatch(/Оплата замовлення/i);
    expect(result.basketOrder).toHaveLength(2);
    expect(result.basketOrder[0]?.sum).toBe(1000);
    expect(result.basketOrder[0]?.total).toBe(1000);
    expect(result.basketOrder[1]?.sum).toBe(1000);
    expect(result.basketOrder[1]?.total).toBe(2000);
    const total = result.basketOrder.reduce((acc, item) => acc + item.total, 0);
    expect(total).toBe(3000);
  });

  it('throws for non-UAH currency', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfoFromSnapshot({
          reference: 'attempt-1',
          order: {
            id: 'order-1',
            currency: 'USD',
            totalAmountMinor: 1000,
          },
          items: [
            {
              productId: 'prod-1',
              title: 'Hat',
              quantity: 1,
              unitPriceMinor: 1000,
              lineTotalMinor: 1000,
            },
          ],
          expectedAmountMinor: 1000,
        }),
      'MONO_UAH_ONLY'
    );
  });

  it('throws for basket sum mismatch', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfoFromSnapshot({
          reference: 'attempt-1',
          order: {
            id: 'order-1',
            currency: 'UAH',
            totalAmountMinor: 1500,
          },
          items: [
            {
              productId: 'prod-1',
              title: 'Hat',
              quantity: 1,
              unitPriceMinor: 1000,
              lineTotalMinor: 1000,
            },
          ],
          expectedAmountMinor: 1500,
        }),
      'MONO_BASKET_SUM_MISMATCH'
    );
  });

  it('throws for invalid qty', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfoFromSnapshot({
          reference: 'attempt-1',
          order: {
            id: 'order-1',
            currency: 'UAH',
            totalAmountMinor: 1000,
          },
          items: [
            {
              productId: 'prod-1',
              title: 'Hat',
              quantity: 0,
              unitPriceMinor: 1000,
              lineTotalMinor: 0,
            },
          ],
          expectedAmountMinor: 1000,
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for non-integer minor units', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfoFromSnapshot({
          reference: 'attempt-1',
          order: {
            id: 'order-1',
            currency: 'UAH',
            totalAmountMinor: 1000,
          },
          items: [
            {
              productId: 'prod-1',
              title: 'Hat',
              quantity: 1,
              unitPriceMinor: 10.5,
              lineTotalMinor: 10.5,
            },
          ],
          expectedAmountMinor: 1000,
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for unsafe integer amounts', () => {
    const tooLarge = Number.MAX_SAFE_INTEGER + 1;
    expectCode(
      () =>
        buildMonoMerchantPaymInfoFromSnapshot({
          reference: 'attempt-1',
          order: {
            id: 'order-1',
            currency: 'UAH',
            totalAmountMinor: tooLarge,
          },
          items: [
            {
              productId: 'prod-1',
              title: 'Hat',
              quantity: 1,
              unitPriceMinor: tooLarge,
              lineTotalMinor: tooLarge,
            },
          ],
          expectedAmountMinor: tooLarge,
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });
});
