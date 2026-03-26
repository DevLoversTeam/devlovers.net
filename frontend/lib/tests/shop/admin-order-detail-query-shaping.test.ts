import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.hoisted(() => vi.fn());

vi.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import { getAdminOrderDetail } from '@/db/queries/shop/admin-orders';

function createSelectBuilder(rows: unknown[]) {
  return {
    from() {
      return this;
    },
    leftJoin() {
      return this;
    },
    where() {
      return Promise.resolve(rows);
    },
  };
}

describe('admin order detail query shaping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collapses shipment-joined rows into deduplicated items and latest shipment state', async () => {
    const sharedOrder = {
      id: 'order-1',
      userId: 'user-1',
      customerAccountName: 'Admin Customer',
      customerAccountEmail: 'customer@example.com',
      status: 'PAID',
      totalAmount: '25.99',
      totalAmountMinor: 2599,
      currency: 'USD',
      paymentStatus: 'paid',
      paymentProvider: 'stripe',
      paymentIntentId: 'pi_123',
      orderStatus: 'PAID',
      returnStatus: null,
      stockRestored: false,
      restockedAt: null,
      idempotencyKey: 'idem-1',
      pspMetadata: {},
      shippingRequired: true,
      shippingProvider: 'nova_poshta',
      shippingMethodCode: 'NP_WAREHOUSE',
      shippingStatus: 'shipped',
      trackingNumber: 'TRACK-123',
      shippingProviderRef: 'ref-123',
      createdAt: new Date('2026-03-10T12:00:00.000Z'),
      updatedAt: new Date('2026-03-10T13:00:00.000Z'),
    };

    const olderShipment = {
      shipmentId: 'shipment-older',
      shipmentStatus: 'queued',
      shipmentAttemptCount: 1,
      shipmentLastErrorCode: 'OLD_ERROR',
      shipmentLastErrorMessage: 'Older shipment state',
      shipmentCreatedAt: new Date('2026-03-10T09:00:00.000Z'),
      shipmentUpdatedAt: new Date('2026-03-10T09:05:00.000Z'),
      shippingAddress: { city: 'Kyiv' },
    };

    const newerShipment = {
      shipmentId: 'shipment-newer',
      shipmentStatus: 'succeeded',
      shipmentAttemptCount: 2,
      shipmentLastErrorCode: null,
      shipmentLastErrorMessage: null,
      shipmentCreatedAt: new Date('2026-03-11T09:00:00.000Z'),
      shipmentUpdatedAt: new Date('2026-03-11T09:05:00.000Z'),
      shippingAddress: { city: 'Kyiv' },
    };

    const itemA = {
      id: 'item-a',
      productId: 'product-a',
      productTitle: 'Item A',
      productSlug: 'item-a',
      productSku: 'SKU-A',
      quantity: 1,
      unitPriceMinor: 1000,
      lineTotalMinor: 1000,
    };

    const itemB = {
      id: 'item-b',
      productId: 'product-b',
      productTitle: 'Item B',
      productSlug: 'item-b',
      productSku: 'SKU-B',
      quantity: 2,
      unitPriceMinor: 800,
      lineTotalMinor: 1600,
    };

    selectMock.mockReturnValue(
      createSelectBuilder([
        { order: sharedOrder, shipping: olderShipment, item: itemA },
        { order: sharedOrder, shipping: olderShipment, item: itemB },
        { order: sharedOrder, shipping: newerShipment, item: itemA },
        { order: sharedOrder, shipping: newerShipment, item: itemB },
      ])
    );

    const detail = await getAdminOrderDetail('order-1');

    expect(detail).not.toBeNull();
    expect(detail?.items.map(item => item.id)).toEqual(['item-a', 'item-b']);
    expect(detail?.shipmentStatus).toBe('succeeded');
    expect(detail?.shipmentAttemptCount).toBe(2);
    expect(detail?.shipmentLastErrorCode).toBeNull();
    expect(detail?.fulfillmentStage).toBe('shipped');
  });
});
