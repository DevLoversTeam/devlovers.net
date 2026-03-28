import fs from 'node:fs';
import path from 'node:path';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDetailPage from '@/app/[locale]/admin/shop/orders/[id]/page';
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
const i18nState = vi.hoisted(() => ({
  locale: 'en',
}));
const messagesRoot = path.join(process.cwd(), 'messages');

function readLocaleMessages(locale: 'en' | 'uk' | 'pl') {
  return JSON.parse(
    fs.readFileSync(path.join(messagesRoot, `${locale}.json`), 'utf8')
  ) as Record<string, unknown>;
}

const localeMessagesCache = {
  en: readLocaleMessages('en'),
  uk: readLocaleMessages('uk'),
  pl: readLocaleMessages('pl'),
};

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    const getByPath = (source: unknown, dottedPath: string): unknown =>
      dottedPath.split('.').reduce<unknown>((acc, segment) => {
        if (!acc || typeof acc !== 'object' || Array.isArray(acc)) {
          return undefined;
        }
        return (acc as Record<string, unknown>)[segment];
      }, source);

    const formatMessage = (
      template: string,
      values?: Record<string, string | number | Date>
    ) =>
      template.replace(/\{(\w+)\}/g, (_match, key: string) =>
        values && key in values ? String(values[key]) : `{${key}}`
      );

    const localeMessages =
      localeMessagesCache[i18nState.locale as 'en' | 'uk' | 'pl'];
    const scopedMessages = getByPath(localeMessages, namespace);
    if (!scopedMessages || typeof scopedMessages !== 'object') {
      throw new Error(`MISSING_NAMESPACE:${namespace}`);
    }

    return (key: string, values?: Record<string, string | number | Date>) => {
      const message = getByPath(scopedMessages, key);
      if (typeof message !== 'string') {
        throw new Error(`MISSING_MESSAGE:${namespace}.${key}`);
      }
      return formatMessage(message, values);
    };
  }),
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
  ShippingActions: () => createElement('div', {}, 'shipping-actions'),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/RefundButton', () => ({
  RefundButton: () => createElement('div', {}, 'refund-button'),
}));

vi.mock('@/app/[locale]/admin/shop/orders/[id]/CancelPaymentButton', () => ({
  CancelPaymentButton: () => createElement('div', {}, 'cancel-payment-button'),
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

function baseHistoryEntry(
  overrides?: Partial<AdminOrderHistoryEntry>
): AdminOrderHistoryEntry {
  return {
    id: 'history-1',
    action: 'mark_shipped',
    occurredAt: new Date('2026-03-10T14:00:00.000Z'),
    actorUserId: 'admin-1',
    actorName: 'Admin User',
    actorEmail: 'admin@example.com',
    requestId: 'req-1',
    source: 'audit',
    fromShippingStatus: 'pending',
    toShippingStatus: 'label_created',
    fromShipmentStatus: 'succeeded',
    ...overrides,
  };
}

async function renderOrder(history: AdminOrderHistoryEntry[], locale = 'en') {
  i18nState.locale = locale;
  getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail());
  getAdminOrderTimelineMock.mockResolvedValue(history);

  return renderToStaticMarkup(
    await OrderDetailPage({
      params: Promise.resolve({
        locale,
        id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    })
  );
}

describe('admin order detail history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18nState.locale = 'en';
    process.env.CSRF_SECRET = 'test_csrf_secret_for_admin_order_detail';
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
  });

  it('renders localized history details for known transition statuses', async () => {
    const html = await renderOrder([
      baseHistoryEntry(),
      baseHistoryEntry({
        id: 'history-2',
        source: 'legacy',
        action: 'complete',
        requestId: null,
        fromShippingStatus: 'shipped',
        toShippingStatus: 'delivered',
        fromShipmentStatus: 'created',
      }),
    ]);

    expect(html).toContain('History');
    expect(html).toContain('Marked as shipped');
    expect(html).toContain('Completed order');
    expect(html).toContain('Shipping: Pending -&gt; Label created');
    expect(html).toContain('Shipment state: Succeeded');
    expect(html).toContain('Request: req-1');
    expect(html).toContain('Legacy history');
    expect(html).toContain('Shipping: Shipped -&gt; Delivered');
    expect(html).toContain('Shipment state: Created');
  });

  it('renders empty history safely', async () => {
    const html = await renderOrder([]);

    expect(html).toContain('History');
    expect(html).toContain('No order history yet.');
  });

  it('renders ukrainian localized history labels without falling back to englishized codes', async () => {
    const html = await renderOrder(
      [
        baseHistoryEntry({
          action: 'mark_delivered',
          fromShippingStatus: 'queued',
          toShippingStatus: 'needs_attention',
          fromShipmentStatus: 'failed',
        }),
      ],
      'uk'
    );

    expect(html).toContain('Історія');
    expect(html).toContain('Позначено як доставлене');
    expect(html).toContain('Доставка: У черзі -&gt; Потребує уваги');
    expect(html).toContain('Стан відправлення: Помилка');
    expect(html).not.toContain('Needs attention');
    expect(html).not.toContain('Failed');
  });
});
