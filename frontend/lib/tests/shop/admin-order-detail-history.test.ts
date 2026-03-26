import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AdminOrderDetail,
  AdminOrderHistoryEntry,
} from '@/db/queries/shop/admin-orders';

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
  getTranslations: vi.fn(
    async () =>
      (key: string, values?: Record<string, string | number | Date>) => {
        if (!values) return key;

        return `${key}:${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(',')}`;
      }
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

describe('admin order detail history timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
    getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail());
  });

  it('renders timeline when order-scoped history exists', async () => {
    const history: AdminOrderHistoryEntry[] = [
      {
        id: 'entry-newer',
        source: 'audit',
        action: 'retry_label_creation',
        occurredAt: new Date('2026-03-12T08:00:00.000Z'),
        actorUserId: 'admin-2',
        actorName: 'Olha Admin',
        actorEmail: 'olha@example.com',
        requestId: 'req-newer',
        fromShippingStatus: 'needs_attention',
        toShippingStatus: 'queued',
        fromShipmentStatus: 'failed',
      },
      {
        id: 'entry-older',
        source: 'legacy',
        action: 'mark_shipped',
        occurredAt: new Date('2026-03-11T08:00:00.000Z'),
        actorUserId: null,
        actorName: null,
        actorEmail: null,
        requestId: 'req-older',
        fromShippingStatus: 'label_created',
        toShippingStatus: 'shipped',
        fromShipmentStatus: 'succeeded',
      },
    ];
    getAdminOrderTimelineMock.mockResolvedValue(history);

    const html = renderToStaticMarkup(
      await OrderDetailPage({
        params: Promise.resolve({
          locale: 'en',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      })
    );

    expect(html).toContain('history.heading');
    expect(html).toContain('history.actions.retryLabelCreation');
    expect(html).toContain('history.actions.markShipped');
    expect(html).toContain('Olha Admin');
    expect(html).toContain('olha@example.com');
    expect(html).toContain(
      'history.shippingTransition:from=needs_attention,to=queued'
    );
    expect(html).toContain('history.shipmentState:status=failed');
    expect(html).toContain('history.requestId:requestId=req-newer');
    expect(html).toContain('history.legacySource');
    expect(html.indexOf('history.actions.retryLabelCreation')).toBeLessThan(
      html.indexOf('history.actions.markShipped')
    );
  });

  it('renders empty history state safely', async () => {
    getAdminOrderTimelineMock.mockResolvedValue([]);

    const html = renderToStaticMarkup(
      await OrderDetailPage({
        params: Promise.resolve({
          locale: 'en',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      })
    );

    expect(html).toContain('history.heading');
    expect(html).toContain('history.empty');
    expect(html).not.toContain('history.actions.markShipped');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});
