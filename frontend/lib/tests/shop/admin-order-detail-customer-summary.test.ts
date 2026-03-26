import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminOrderDetail } from '@/db/queries/shop/admin-orders';

const getAdminOrderDetailMock = vi.hoisted(() => vi.fn());
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

import OrderDetailPage from '@/app/[locale]/admin/shop/orders/[id]/page';

function baseOrderDetail(
  overrides?: Partial<AdminOrderDetail>
): AdminOrderDetail {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    userId: 'user-123',
    customerAccountName: 'Admin Customer',
    customerAccountEmail: 'customer@example.com',
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
    shippingAddress: {
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      selection: {
        cityNameUa: 'Kyiv',
        warehouseName: 'Warehouse 12',
        addressLine1: 'Khreshchatyk 1',
        addressLine2: 'Apt 10',
      },
      recipient: {
        fullName: 'Ivan Petrenko',
        phone: '+380501112233',
        email: 'ivan@example.com',
        comment: 'Call me before delivery',
      },
    },
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readFieldValue(html: string, label: string): string | null {
  const pattern = new RegExp(
    `<dt[^>]*>${escapeRegExp(label)}</dt><dd[^>]*>([\\s\\S]*?)</dd>`,
    'i'
  );
  const match = html.match(pattern);
  if (!match?.[1]) return null;

  return match[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('admin order detail customer summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
  });

  it('renders customer summary when snapshot data exists', async () => {
    getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail());

    const html = renderToStaticMarkup(
      await OrderDetailPage({
        params: Promise.resolve({
          locale: 'en',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      })
    );

    expect(getAdminOrderDetailMock).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(html).toContain('customerSummary');
    expect(html).toContain('Admin Customer');
    expect(html).toContain('customer@example.com');
    expect(html).toContain('Ivan Petrenko');
    expect(html).toContain('+380501112233');
    expect(html).toContain('ivan@example.com');
    expect(html).toContain('Kyiv');
    expect(html).toContain('Warehouse 12');
    expect(html).toContain('Khreshchatyk 1, Apt 10');
    expect(html).toContain('Call me before delivery');
    expect(readFieldValue(html, 'shippingProviderLabel')).toBe(
      'shippingProviders.novaPoshta'
    );
    expect(readFieldValue(html, 'shippingMethod')).toBe(
      'shippingMethods.novaPoshtaWarehouse'
    );
    expect(html).toContain('Classic Hoodie');
  });

  it('degrades safely when optional customer fields are missing', async () => {
    getAdminOrderDetailMock.mockResolvedValue(
      baseOrderDetail({
        userId: null,
        customerAccountName: null,
        customerAccountEmail: null,
        shippingStatus: null,
        trackingNumber: null,
        paymentIntentId: null,
        shippingAddress: {
          recipient: {
            fullName: 'Olena',
          },
        },
      })
    );

    const html = renderToStaticMarkup(
      await OrderDetailPage({
        params: Promise.resolve({
          locale: 'en',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      })
    );

    expect(html).toContain('customerSummary');
    expect(readFieldValue(html, 'customerAccount')).toBe('guest');
    expect(html).toContain('Olena');
    expect(html).toContain('orderSummary');
    expect(html).toContain('Classic Hoodie');
    expect(readFieldValue(html, 'recipientPhone')).toBe('-');
    expect(readFieldValue(html, 'recipientEmail')).toBe('-');
    expect(readFieldValue(html, 'city')).toBe('-');
    expect(readFieldValue(html, 'pickupPoint')).toBe('-');
    expect(readFieldValue(html, 'address')).toBe('-');
    expect(readFieldValue(html, 'comment')).toBe('-');
    expect(readFieldValue(html, 'shippingProviderLabel')).toBe(
      'shippingProviders.novaPoshta'
    );
    expect(readFieldValue(html, 'shippingMethod')).toBe(
      'shippingMethods.novaPoshtaWarehouse'
    );
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});
