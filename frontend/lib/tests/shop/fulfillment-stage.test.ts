import { describe, expect, it } from 'vitest';

import { deriveCanonicalFulfillmentStage } from '@/lib/services/shop/fulfillment-stage';
import {
  canonicalFulfillmentStageValues,
  fulfillmentStageSchema,
} from '@/lib/validation/shop';

describe('canonical fulfillment stage mapping', () => {
  it('uses one shared canonical fulfillment stage value set for schema validation', () => {
    expect(canonicalFulfillmentStageValues).toEqual([
      'processing',
      'packed',
      'shipped',
      'delivered',
      'canceled',
      'returned',
    ]);

    for (const value of canonicalFulfillmentStageValues) {
      expect(fulfillmentStageSchema.parse(value)).toBe(value);
    }

    expect(() => fulfillmentStageSchema.parse('mystery')).toThrow();
  });

  it('maps pre-shipment orders to processing by default', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'CREATED',
        shippingStatus: 'pending',
        shipmentStatus: null,
        returnStatus: null,
      })
    ).toBe('processing');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: null,
        shipmentStatus: null,
        returnStatus: null,
      })
    ).toBe('processing');
  });

  it('maps queued and label states to the explicit packed stage', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'queued',
        shipmentStatus: 'queued',
      })
    ).toBe('packed');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'creating_label',
        shipmentStatus: 'processing',
      })
    ).toBe('packed');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'label_created',
        shipmentStatus: 'succeeded',
      })
    ).toBe('packed');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'needs_attention',
        shipmentStatus: 'failed',
      })
    ).toBe('packed');
  });

  it('maps shipment-row edge cases to packed deterministically even if order shipping status lags', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'pending',
        shipmentStatus: 'succeeded',
        returnStatus: null,
      })
    ).toBe('packed');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: null,
        shipmentStatus: 'processing',
        returnStatus: null,
      })
    ).toBe('packed');
  });

  it('maps shipped and delivered explicitly', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'shipped',
        shipmentStatus: 'succeeded',
      })
    ).toBe('shipped');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'delivered',
        shipmentStatus: 'succeeded',
      })
    ).toBe('delivered');
  });

  it('maps canceled explicitly from order or shipping terminal states', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'CANCELED',
        shippingStatus: 'pending',
        shipmentStatus: null,
      })
    ).toBe('canceled');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'cancelled',
        shipmentStatus: 'queued',
      })
    ).toBe('canceled');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'INVENTORY_FAILED',
        shippingStatus: null,
        shipmentStatus: null,
      })
    ).toBe('canceled');
  });

  it('maps returned explicitly from terminal return states', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'delivered',
        shipmentStatus: 'succeeded',
        returnStatus: 'received',
      })
    ).toBe('returned');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'CANCELED',
        shippingStatus: 'cancelled',
        shipmentStatus: null,
        returnStatus: 'refunded',
      })
    ).toBe('returned');
  });

  it('does not treat non-terminal return states as returned', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'delivered',
        shipmentStatus: 'succeeded',
        returnStatus: 'requested',
      })
    ).toBe('delivered');

    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'PAID',
        shippingStatus: 'shipped',
        shipmentStatus: 'succeeded',
        returnStatus: 'approved',
      })
    ).toBe('shipped');
  });

  it('falls back deterministically for unexpected combinations', () => {
    expect(
      deriveCanonicalFulfillmentStage({
        orderStatus: 'UNKNOWN',
        shippingStatus: 'mystery',
        shipmentStatus: 'odd',
        returnStatus: 'weird',
      })
    ).toBe('processing');
  });
});
