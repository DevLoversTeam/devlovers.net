import fs from 'node:fs';
import path from 'node:path';

import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderDetailPage from '@/app/[locale]/admin/shop/orders/[id]/page';
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
const i18nState = vi.hoisted(() => ({
  locale: 'en',
}));
const messagesRoot = path.join(process.cwd(), 'messages');
const previousCsrfSecret = process.env.CSRF_SECRET;

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

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
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

function countOccurrences(html: string, value: string): number {
  return html.split(value).length - 1;
}

describe('admin order detail customer summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    i18nState.locale = 'en';
    process.env.CSRF_SECRET = 'test_csrf_secret_for_admin_order_detail';
    getCurrentUserMock.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
    });
    getAdminOrderTimelineMock.mockResolvedValue([]);
  });

  afterEach(() => {
    if (typeof previousCsrfSecret === 'undefined') {
      delete process.env.CSRF_SECRET;
      return;
    }

    process.env.CSRF_SECRET = previousCsrfSecret;
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
    expect(html).toContain('Customer summary');
    expect(html).toContain('Admin actions');
    expect(html).toContain('shipping-actions');
    expect(html).toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
    expect(html).toContain('Admin Customer');
    expect(html).toContain('customer@example.com');
    expect(html).toContain('Ivan Petrenko');
    expect(html).toContain('+380501112233');
    expect(html).toContain('ivan@example.com');
    expect(html).toContain('Kyiv');
    expect(html).toContain('Warehouse 12');
    expect(html).toContain('Khreshchatyk 1, Apt 10');
    expect(html).toContain('Call me before delivery');
    expect(readFieldValue(html, 'Shipping provider')).toBe('Nova Poshta');
    expect(readFieldValue(html, 'Shipping method')).toBe(
      'Nova Poshta warehouse'
    );
    expect(readFieldValue(html, 'Shipping status')).toBe('Label created');
    expect(readFieldValue(html, 'Provider')).toBe('Stripe');
    expect(readFieldValue(html, 'Payment status')).toBe('Paid');
    expect(countOccurrences(html, 'customer@example.com')).toBe(1);
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

    expect(html).toContain('Customer summary');
    expect(readFieldValue(html, 'Customer account')).toBe('Guest checkout');
    expect(html).toContain('Olena');
    expect(html).not.toContain('shipping-actions');
    expect(html).toContain('refund-button');
    expect(html).not.toContain('cancel-payment-button');
    expect(html).toContain('Order summary');
    expect(html).toContain('Classic Hoodie');
    expect(readFieldValue(html, 'Recipient phone')).toBe('-');
    expect(readFieldValue(html, 'Recipient email')).toBe('-');
    expect(readFieldValue(html, 'City')).toBe('-');
    expect(readFieldValue(html, 'Pickup point')).toBe('-');
    expect(readFieldValue(html, 'Address')).toBe('-');
    expect(readFieldValue(html, 'Comment')).toBe('-');
    expect(readFieldValue(html, 'Shipping provider')).toBe('Nova Poshta');
    expect(readFieldValue(html, 'Shipping method')).toBe(
      'Nova Poshta warehouse'
    );
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders registered account snapshots when only account name is available', async () => {
    getAdminOrderDetailMock.mockResolvedValue(
      baseOrderDetail({
        customerAccountName: 'Named Account',
        customerAccountEmail: null,
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

    expect(readFieldValue(html, 'Customer account')).toBe('Named Account');
    expect(html).not.toContain('Account unavailable');
    expect(html).not.toContain('customer@example.com');
  });

  it('renders account-email-only registered snapshots once without duplicate secondary line', async () => {
    getAdminOrderDetailMock.mockResolvedValue(
      baseOrderDetail({
        customerAccountName: null,
        customerAccountEmail: 'email-only@example.com',
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

    expect(readFieldValue(html, 'Customer account')).toBe(
      'email-only@example.com'
    );
    expect(countOccurrences(html, 'email-only@example.com')).toBe(1);
  });

  it('humanizes unknown shipping provider and method values instead of rendering raw enum-style codes', async () => {
    getAdminOrderDetailMock.mockResolvedValue(
      baseOrderDetail({
        shippingProvider: 'custom_provider',
        shippingMethodCode: 'CUSTOM_PICKUP_POINT',
        shippingAddress: {
          provider: 'custom_provider',
          methodCode: 'CUSTOM_PICKUP_POINT',
          recipient: {
            fullName: 'Ivan Petrenko',
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

    expect(readFieldValue(html, 'Shipping provider')).toBe('Custom Provider');
    expect(readFieldValue(html, 'Shipping method')).toBe('Custom Pickup Point');
  });

  it('falls back safely when registered account snapshots have neither name nor email', async () => {
    getAdminOrderDetailMock.mockResolvedValue(
      baseOrderDetail({
        customerAccountName: null,
        customerAccountEmail: null,
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

    expect(readFieldValue(html, 'Customer account')).toBe('Registered account');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders known provider and status labels in ukrainian locale without missing-message errors', async () => {
    i18nState.locale = 'uk';
    getAdminOrderDetailMock.mockResolvedValue(baseOrderDetail());

    const html = renderToStaticMarkup(
      await OrderDetailPage({
        params: Promise.resolve({
          locale: 'uk',
          id: '550e8400-e29b-41d4-a716-446655440000',
        }),
      })
    );

    expect(html).toContain('Підсумок клієнта');
    expect(readFieldValue(html, 'Провайдер')).toBe('Stripe');
    expect(readFieldValue(html, 'Статус оплати')).toBe('Оплачено');
    expect(readFieldValue(html, 'Статус доставки')).toBe('Накладну створено');
    expect(readFieldValue(html, 'Провайдер доставки')).toBe('Нова пошта');
    expect(readFieldValue(html, 'Метод доставки')).toBe(
      'Відділення Нової пошти'
    );
  });
});
