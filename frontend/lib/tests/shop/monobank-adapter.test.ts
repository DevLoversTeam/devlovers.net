import { describe, expect, it } from 'vitest';

import { buildMonobankInvoicePayload } from '@/lib/psp/monobank';
import { MONO_CCY } from '@/lib/psp/monobank';

describe('monobank invoice adapter', () => {
  it('uses ccy=980 and paymentType=debit', () => {
    const payload = buildMonobankInvoicePayload({
      amountMinor: 1500,
      orderId: 'order_test',
      redirectUrl:
        'https://example.test/shop/checkout/success?orderId=order_test',
      webhookUrl: 'https://example.test/api/shop/webhooks/monobank',
      paymentType: 'debit',
      merchantPaymInfo: {
        reference: 'attempt-1',
        destination: 'Оплата замовлення 1',
        basketOrder: [
          {
            name: 'Item',
            qty: 1,
            sum: 1500,
            total: 1500,
            unit: 'шт.',
          },
        ],
      },
    });

    expect(payload.ccy).toBe(MONO_CCY);
    expect(payload.paymentType).toBe('debit');
  });

  it('rejects non-debit paymentType', () => {
    expect(() =>
      buildMonobankInvoicePayload({
        amountMinor: 1500,
        orderId: 'order_test',
        redirectUrl:
          'https://example.test/shop/checkout/success?orderId=order_test',
        webhookUrl: 'https://example.test/api/shop/webhooks/monobank',
        paymentType: 'hold' as any,
        merchantPaymInfo: {
          reference: 'attempt-1',
          destination: 'Оплата замовлення 1',
          basketOrder: [
            {
              name: 'Item',
              qty: 1,
              sum: 1500,
              total: 1500,
              unit: 'шт.',
            },
          ],
        },
      })
    ).toThrow();
  });
});
