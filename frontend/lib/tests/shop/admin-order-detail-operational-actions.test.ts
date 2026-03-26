import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminOrderDetail } from '@/db/queries/shop/admin-orders';

const getAdminOrderDetailMock = vi.hoisted(() => vi.fn());
const getAdminOrderTimelineMock = vi.hoisted(() => vi.fn());
const getCurrentUserMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  })
);
const redirectMock = vi.hoisted(() =>
  vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  })
);

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock('@/db/queries/shop/admin-orders', () => ({
  getAdminOrderDetail: (id: string) => getAdminOrderDetailMock(id),
  getAdminOrderTimeline: (id: string) => getAdminOrderTimelineMock(id),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement('a', { href, ...props }, children),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/ShippingActions', () => ({
  ShippingActions: ({
    orderId,
    shippingStatus,
    shipmentStatus,
  }: {
    orderId: string;
    shippingStatus: string | null;
    shipmentStatus: string | null;
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'shipping-actions',
        'data-order-id': orderId,
        'data-shipping-status': shippingStatus ?? '',
        'data-shipment-status': shipmentStatus ?? '',
      },
      'shipping-actions'
    ),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/RefundButton', () => ({
  RefundButton: ({ orderId }: { orderId: string }) =>
    createElement(
      'div',
      { 'data-testid': 'refund-button', 'data-order-id': orderId },
      'refund-button'
    ),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/CancelPaymentButton', () => ({
  CancelPaymentButton: ({ orderId }: { orderId: string }) =>
    createElement(
      'div',
      { 'data-testid': 'cancel-payment-button', 'data-order-id': orderId },
      'cancel-payment-button'
    ),
}));

import OrderDetailPage from '@/app/[locale]/admin/shop/orders/[id]/page';

function baseOrderDetail(
  overrides?: Partial<AdminOrderDetail>
): AdminOrderDetail {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    customerAccountName: 'Admin Customer',
    customerAccountEmail: 'customer@example.com',
    status: 'PAID',
    totalAmountMinor: 2599,
    totalAmount: '25.99',
    currency: 'USD',
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    paymentIntentId: 'pi_test_123',
    fulfillmentStage: 'processing',
    stockRestored: false,
    restockedAt: null,
    idempotencyKey: 'idem-123',
    pspMetadata: {},
    shippingRequired: true,
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingStatus: 'label_created',
    trackingNumber: 'TRACK-123',
    shippingProviderRef: 'ref-123',
    shipmentStatus: 'created',
    shipmentAttemptCount: 1,
    shipmentLastErrorCode: null,
    shipmentLastErrorMessage: null,
    shippingAddress: null,
    createdAt: new Date('2026-03-10T12:00:00.000Z'),
    updatedAt: new Date('2026-03-10T13:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        productTitle: 'Classic Hoodie',
        productSlug: 'classic-hoodie',
        productSku: 'SKU-1',
        unitPriceMinor: 2599,
        lineTotalMinor: 2599,
        quantity: 1,
        unitPrice: '25.99',
        lineTotal: '25.99',
      },
    ],
    ...overrides,
  };
}

async function renderOrder(overrides?: Partial<AdminOrderDetail>) {
  getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail(overrides));

  return renderToStaticMarkup(
    await OrderDetailPage({
      params: Promise.resolve({
        locale: 'en',
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    })
  );
}

describe('admin order detail operational actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CSRF_SECRET = 'test_csrf_secret_for_admin_order_detail';
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
    getAdminOrderTimelineMock.mockResolvedValue([]);
  });

  it('renders existing shipping and refund controls for eligible Stripe orders', async () => {
    const html = await renderOrder();

    expect(html).toContain('actions.heading');
    expect(html).toContain('shippingControls.heading');
    expect(html).toContain('paymentControls.heading');
    expect(html).toContain('shipping-actions');
    expect(html).toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
    expect(html).not.toContain('lifecycle.complete');
  });

  it('renders cancel-payment control and suppresses duplicate generic cancel for Monobank unpaid orders', async () => {
    const html = await renderOrder({
      status: 'CREATED',
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
      shippingRequired: false,
      shippingProvider: null,
      shippingMethodCode: null,
      shippingStatus: null,
      shipmentStatus: null,
      paymentIntentId: null,
    });

    expect(html).toContain('paymentControls.heading');
    expect(html).toContain('cancel-payment-button');
    expect(html).not.toContain('refund-button');
    expect(html).not.toContain('shipping-actions');
    expect(html).not.toContain('lifecycle.cancel');
  });

  it('renders confirm as a lifecycle action when it is the only eligible operational action', async () => {
    const html = await renderOrder({
      status: 'INVENTORY_RESERVED',
      paymentProvider: 'monobank',
      paymentStatus: 'paid',
      shippingRequired: false,
      shippingProvider: null,
      shippingMethodCode: null,
      shippingStatus: null,
      shipmentStatus: null,
    });

    expect(html).toContain('lifecycle.heading');
    expect(html).toContain('lifecycle.confirm');
    expect(html).not.toContain('shipping-actions');
    expect(html).not.toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
  });
});
