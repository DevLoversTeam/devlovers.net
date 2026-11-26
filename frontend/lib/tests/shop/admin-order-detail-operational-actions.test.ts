import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDetailPage from '@/app/[locale]/admin/shop/orders/[id]/page';
import { getAdminOrderShippingActionVisibility } from '@/app/[locale]/admin/shop/orders/[id]/shippingActionVisibility';
import type { AdminOrderDetail } from '@/db/queries/shop/admin-orders';
import type { Locale } from '@/i18n/config';
import { createLocaleTranslator } from '@/lib/tests/helpers/locale-translator';

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
const i18nState = vi.hoisted(() => ({
  locale: 'en' as Locale,
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) =>
    createLocaleTranslator(i18nState.locale, namespace)
  ),
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
    shippingReady,
    shippingStatus,
    shipmentStatus,
  }: {
    orderId: string;
    shippingReady: boolean;
    shippingStatus: string | null;
    shipmentStatus: string | null;
  }) =>
    createElement(
      'div',
      {
        'data-testid': 'shipping-actions',
        'data-order-id': orderId,
        'data-shipping-ready': String(shippingReady),
        'data-shipping-status': shippingStatus ?? '',
        'data-shipment-status': shipmentStatus ?? '',
      },
      'shipping-actions'
    ),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/ShippingEditForm', () => ({
  ShippingEditForm: () => createElement('div', {}, 'shipping-edit-form'),
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

function baseOrderDetail(
  overrides?: Partial<AdminOrderDetail>
): AdminOrderDetail {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    customerAccountName: 'Admin Customer',
    customerAccountEmail: 'customer@example.com',
    status: 'PAID',
    inventoryStatus: 'reserved',
    pspStatusReason: null,
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
    shipmentStatus: 'queued',
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

async function renderOrder(
  overrides?: Partial<AdminOrderDetail>,
  locale: Locale = 'en'
) {
  i18nState.locale = locale;
  getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail(overrides));

  return renderToStaticMarkup(
    await OrderDetailPage({
      params: Promise.resolve({
        locale,
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    })
  );
}

describe('admin order detail operational actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18nState.locale = 'en';
    vi.stubEnv('CSRF_SECRET', 'test_csrf_secret_for_admin_order_detail');
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
    getAdminOrderTimelineMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders existing shipping and refund controls for eligible Stripe orders', async () => {
    expect(
      getAdminOrderShippingActionVisibility({
        shippingReady: true,
        shippingStatus: 'label_created',
        shipmentStatus: 'queued',
      })
    ).toEqual({
      recoverInitialShipment: false,
      retryLabelCreation: false,
      markShipped: true,
      markDelivered: false,
    });

    const html = await renderOrder();

    expect(html).toContain('Admin actions');
    expect(html).toContain('Shipment handling');
    expect(html).toContain('Payment handling');
    expect(html).toContain('shipping-actions');
    expect(html).toContain('data-shipping-ready="true"');
    expect(html).toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
    expect(html).not.toContain('>Complete<');
  });

  it('renders cancel-payment control for Monobank unpaid orders', async () => {
    const html = await renderOrder({
      status: 'CREATED',
      inventoryStatus: 'none',
      paymentProvider: 'monobank',
      paymentStatus: 'pending',
      shippingRequired: false,
      shippingProvider: null,
      shippingMethodCode: null,
      shippingStatus: null,
      shipmentStatus: null,
      paymentIntentId: null,
    });

    expect(html).toContain('Payment handling');
    expect(html).toContain('cancel-payment-button');
    expect(html).not.toContain('refund-button');
    expect(html).not.toContain('shipping-actions');
  });

  it('renders confirm as a lifecycle action when it is the only eligible operational action', async () => {
    const html = await renderOrder({
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      paymentProvider: 'monobank',
      paymentStatus: 'paid',
      shippingRequired: false,
      shippingProvider: null,
      shippingMethodCode: null,
      shippingStatus: null,
      shipmentStatus: null,
    });

    expect(html).toContain('Status updates');
    expect(html).toContain('>Confirm<');
    expect(html).not.toContain('shipping-actions');
    expect(html).not.toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
  });

  it('hides complete and shipping controls when refund containment blocks shipping eligibility', async () => {
    expect(
      getAdminOrderShippingActionVisibility({
        shippingReady: false,
        shippingStatus: 'shipped',
        shipmentStatus: 'succeeded',
      })
    ).toEqual({
      recoverInitialShipment: false,
      retryLabelCreation: false,
      markShipped: false,
      markDelivered: false,
    });

    const html = await renderOrder({
      status: 'PAID',
      inventoryStatus: 'reserved',
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      pspStatusReason: 'REFUND_REQUESTED',
      shippingRequired: true,
      shippingProvider: 'nova_poshta',
      shippingMethodCode: 'NP_WAREHOUSE',
      shippingStatus: 'shipped',
      shipmentStatus: 'succeeded',
    });

    expect(html).toContain('Admin actions');
    expect(html).not.toContain('shipping-actions');
    expect(html).not.toContain('data-shipping-ready="true"');
    expect(html).not.toContain('>Complete<');
    expect(html).toContain('refund-button');
  });
});
