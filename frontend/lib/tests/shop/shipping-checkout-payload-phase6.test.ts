import { describe, expect, it } from 'vitest';

import {
  buildCheckoutShippingPayload,
  shippingUnavailableMessage,
} from '@/lib/services/shop/shipping/checkout-payload';

describe('phase6 checkout shipping payload helper', () => {
  it('builds NP warehouse payload shape without client prices/totals', () => {
    const result = buildCheckoutShippingPayload({
      shippingAvailable: true,
      reasonCode: 'OK',
      locale: 'uk-UA',
      methodCode: 'NP_WAREHOUSE',
      cityRef: '8d5a980d-391c-11dd-90d9-001a92567626',
      warehouseRef: '9a68df70-0267-42a8-bb5c-37f427e36ee4',
      addressLine1: null,
      addressLine2: null,
      recipientFullName: '  Ivan Petrenko  ',
      recipientPhone: '+380501112233',
      recipientEmail: 'ivan@example.com',
      recipientComment: 'Call before delivery',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.country).toBe('UA');
    expect(result.shipping).toMatchObject({
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      selection: {
        cityRef: '8d5a980d-391c-11dd-90d9-001a92567626',
        warehouseRef: '9a68df70-0267-42a8-bb5c-37f427e36ee4',
      },
      recipient: {
        fullName: 'Ivan Petrenko',
        phone: '+380501112233',
        email: 'ivan@example.com',
        comment: 'Call before delivery',
      },
    });
  });

  it('builds NP courier payload shape with address fields', () => {
    const result = buildCheckoutShippingPayload({
      shippingAvailable: true,
      reasonCode: 'OK',
      locale: 'uk',
      methodCode: 'NP_COURIER',
      cityRef: '8d5a980d-391c-11dd-90d9-001a92567626',
      warehouseRef: null,
      addressLine1: 'Khreshchatyk 1',
      addressLine2: 'Apt 10',
      recipientFullName: 'Olena',
      recipientPhone: '0501112233',
      recipientEmail: null,
      recipientComment: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shipping).toMatchObject({
      methodCode: 'NP_COURIER',
      selection: {
        cityRef: '8d5a980d-391c-11dd-90d9-001a92567626',
        addressLine1: 'Khreshchatyk 1',
        addressLine2: 'Apt 10',
      },
      recipient: {
        fullName: 'Olena',
        phone: '0501112233',
      },
    });
  });

  it('returns shipping unavailable UX message for unsupported country', () => {
    const result = buildCheckoutShippingPayload({
      shippingAvailable: false,
      reasonCode: 'COUNTRY_NOT_SUPPORTED',
      locale: 'en-US',
      methodCode: null,
      cityRef: null,
      warehouseRef: null,
      addressLine1: null,
      addressLine2: null,
      recipientFullName: null,
      recipientPhone: null,
      recipientEmail: null,
      recipientComment: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('SHIPPING_UNAVAILABLE');
    expect(result.message).toBe(shippingUnavailableMessage('COUNTRY_NOT_SUPPORTED'));
  });
});
