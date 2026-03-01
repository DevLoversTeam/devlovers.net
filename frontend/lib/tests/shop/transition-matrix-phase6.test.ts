import { describe, expect, it } from 'vitest';

import {
  isOrderNonPaymentStatusTransitionAllowed,
  isOrderQuoteStatusTransitionAllowed,
} from '@/lib/services/shop/transitions/order-state';
import { isReturnStatusTransitionAllowed } from '@/lib/services/shop/transitions/return-state';
import { isShippingStatusTransitionAllowed } from '@/lib/services/shop/transitions/shipping-state';

describe('transition matrix phase 6', () => {
  it('order non-payment matrix allows/forbids expected transitions', () => {
    expect(
      isOrderNonPaymentStatusTransitionAllowed('CREATED', 'INVENTORY_RESERVED')
    ).toBe(true);
    expect(
      isOrderNonPaymentStatusTransitionAllowed(
        'INVENTORY_RESERVED',
        'INVENTORY_FAILED'
      )
    ).toBe(true);
    expect(
      isOrderNonPaymentStatusTransitionAllowed('INVENTORY_FAILED', 'CANCELED')
    ).toBe(true);
    expect(
      isOrderNonPaymentStatusTransitionAllowed('PAID', 'INVENTORY_FAILED')
    ).toBe(true);
    expect(
      isOrderNonPaymentStatusTransitionAllowed('CANCELED', 'INVENTORY_RESERVED')
    ).toBe(false);
  });

  it('order quote matrix allows/forbids expected transitions', () => {
    expect(isOrderQuoteStatusTransitionAllowed('none', 'requested')).toBe(true);
    expect(isOrderQuoteStatusTransitionAllowed('declined', 'requested')).toBe(
      true
    );
    expect(isOrderQuoteStatusTransitionAllowed('offered', 'requested')).toBe(
      false
    );

    expect(isOrderQuoteStatusTransitionAllowed('requested', 'offered')).toBe(
      true
    );
    expect(isOrderQuoteStatusTransitionAllowed('offered', 'accepted')).toBe(
      true
    );
    expect(isOrderQuoteStatusTransitionAllowed('accepted', 'offered')).toBe(
      false
    );
    expect(
      isOrderQuoteStatusTransitionAllowed('accepted', 'requires_requote')
    ).toBe(true);
  });

  it('shipping matrix allows/forbids expected transitions', () => {
    expect(isShippingStatusTransitionAllowed('pending', 'queued')).toBe(true);
    expect(
      isShippingStatusTransitionAllowed('creating_label', 'queued')
    ).toBe(true);
    expect(
      isShippingStatusTransitionAllowed('needs_attention', 'queued')
    ).toBe(true);
    expect(
      isShippingStatusTransitionAllowed(null, 'queued', { allowNullFrom: true })
    ).toBe(true);
    expect(isShippingStatusTransitionAllowed('shipped', 'queued')).toBe(false);
    expect(
      isShippingStatusTransitionAllowed('label_created', 'shipped')
    ).toBe(true);
    expect(
      isShippingStatusTransitionAllowed('creating_label', 'shipped')
    ).toBe(false);
    expect(isShippingStatusTransitionAllowed('shipped', 'delivered')).toBe(
      true
    );
  });

  it('return matrix allows/forbids expected transitions', () => {
    expect(isReturnStatusTransitionAllowed('requested', 'approved')).toBe(true);
    expect(isReturnStatusTransitionAllowed('requested', 'rejected')).toBe(true);
    expect(isReturnStatusTransitionAllowed('approved', 'received')).toBe(true);
    expect(isReturnStatusTransitionAllowed('received', 'refunded')).toBe(true);

    expect(isReturnStatusTransitionAllowed('approved', 'rejected')).toBe(false);
    expect(isReturnStatusTransitionAllowed('requested', 'refunded')).toBe(
      false
    );
    expect(isReturnStatusTransitionAllowed('refunded', 'approved')).toBe(
      false
    );
  });
});
