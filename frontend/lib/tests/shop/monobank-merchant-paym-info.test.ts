import { describe, expect, it } from 'vitest';

import {
  buildMonoMerchantPaymInfo,
  MonoMerchantPaymInfoError,
} from '@/lib/services/orders/monobank/merchant-paym-info';

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('expected error');
  } catch (error) {
    expect(error).toBeInstanceOf(MonoMerchantPaymInfoError);
    const err = error as MonoMerchantPaymInfoError;
    expect(err.code).toBe(code);
  }
}

describe('buildMonoMerchantPaymInfo', () => {
  it('builds merchantPaymInfo for a valid snapshot', () => {
    const result = buildMonoMerchantPaymInfo({
      reference: 'attempt-1',
      destination: 'Оплата замовлення 123',
      currency: 'UAH',
      expectedAmountMinor: 3000,
      items: [
        { name: 'Hat', quantity: 1, unitPriceMinor: 1000 },
        { name: 'Shirt', quantity: 2, unitPriceMinor: 1000 },
      ],
    });

    expect(result.reference).toBe('attempt-1');
    expect(result.destination).toBe('Оплата замовлення 123');
    expect(result.basketOrder).toHaveLength(2);
    expect(result.basketOrder[0]?.sum).toBe(1000);
    expect(result.basketOrder[1]?.sum).toBe(1000);
    expect(result.basketOrder[0]?.total).toBe(1000);
    expect(result.basketOrder[1]?.total).toBe(2000);
    const total = result.basketOrder.reduce((acc, item) => acc + item.total, 0);

    expect(total).toBe(3000);
  });

  it('throws for basket sum mismatch', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1500,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: 1000 }],
        }),
      'MONO_BASKET_SUM_MISMATCH'
    );
  });

  it('throws for non-UAH currency', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'USD',
          expectedAmountMinor: 1000,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: 1000 }],
        }),
      'MONO_UAH_ONLY'
    );
  });

  it('throws for invalid qty', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1000,
          items: [{ name: 'Hat', quantity: 0, unitPriceMinor: 1000 }],
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for invalid unit price', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1000,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: -5 }],
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for non-integer unit price', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1000,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: 10.5 }],
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for non-integer expected amount', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: 'attempt-1',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1000.5,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: 1000 }],
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });

  it('throws for empty reference', () => {
    expectCode(
      () =>
        buildMonoMerchantPaymInfo({
          reference: '   ',
          destination: 'Оплата замовлення 123',
          currency: 'UAH',
          expectedAmountMinor: 1000,
          items: [{ name: 'Hat', quantity: 1, unitPriceMinor: 1000 }],
        }),
      'MONO_INVALID_SNAPSHOT'
    );
  });
});
