import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: dbSelectMock,
    insert: vi.fn(() => {
      throw new Error('Unexpected db.insert in authoritative priceMinor test');
    }),
    update: vi.fn(() => {
      throw new Error('Unexpected db.update in authoritative priceMinor test');
    }),
    delete: vi.fn(() => {
      throw new Error('Unexpected db.delete in authoritative priceMinor test');
    }),
  },
}));

vi.mock('@/lib/services/orders/summary', () => ({
  getOrderByIdempotencyKey: vi.fn(async () => null),
  getOrderById: vi.fn(async () => null),
}));

import { createOrderWithItems } from '@/lib/services/orders/checkout';
import { rehydrateCartItems } from '@/lib/services/products';
import { TEST_LEGAL_CONSENT } from '@/lib/tests/shop/test-legal-consent';

function mockSelectRows(rows: unknown[]) {
  dbSelectMock.mockImplementationOnce(() => ({
    from: () => ({
      leftJoin: () => ({
        where: async () => rows,
      }),
    }),
  }));
}

describe('checkout authoritative priceMinor guard', () => {
  beforeEach(() => {
    dbSelectMock.mockReset();
  });

  it('rehydrateCartItems fails closed when authoritative priceMinor is missing even if decimal price is present', async () => {
    mockSelectRows([
      {
        id: 'prod_rehydrate_missing_minor',
        slug: 'prod-rehydrate-missing-minor',
        title: 'Rehydrate Missing Minor',
        stock: 5,
        isActive: true,
        badge: 'NONE',
        imageUrl: 'https://example.com/rehydrate.png',
        colors: [],
        sizes: [],
        priceMinor: null,
        price: '19.99',
        priceCurrency: 'UAH',
      },
    ]);

    await expect(
      rehydrateCartItems(
        [{ productId: 'prod_rehydrate_missing_minor', quantity: 1 }],
        'UAH'
      )
    ).rejects.toMatchObject({
      code: 'PRICE_CONFIG_ERROR',
      productId: 'prod_rehydrate_missing_minor',
      currency: 'UAH',
    });
  });

  it('createOrderWithItems fails closed when checkout pricing row lacks authoritative priceMinor even if decimal price is present', async () => {
    mockSelectRows([
      {
        id: 'prod_checkout_missing_minor',
        slug: 'prod-checkout-missing-minor',
        title: 'Checkout Missing Minor',
        stock: 5,
        sku: null,
        colors: [],
        sizes: [],
        priceMinor: null,
        price: '19.99',
        originalPrice: null,
        priceCurrency: 'UAH',
        isActive: true,
      },
    ]);

    await expect(
      createOrderWithItems({
        items: [{ productId: 'prod_checkout_missing_minor', quantity: 1 }],
        idempotencyKey: crypto.randomUUID(),
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        shipping: null,
        legalConsent: TEST_LEGAL_CONSENT,
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      })
    ).rejects.toMatchObject({
      code: 'PRICE_CONFIG_ERROR',
      productId: 'prod_checkout_missing_minor',
      currency: 'UAH',
    });
  });
});
