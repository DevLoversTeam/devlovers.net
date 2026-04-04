import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  inventoryMoves,
  npCities,
  npWarehouses,
  orderItems,
  orders,
  orderShipping,
  productPrices,
  products,
} from '@/db/schema/shop';
import { resetEnvCache } from '@/lib/env';
import {
  IdempotencyConflictError,
  InvalidPayloadError,
} from '@/lib/services/errors';
import { createOrderWithItems } from '@/lib/services/orders';

import { createTestLegalConsent } from './test-legal-consent';

type SeedData = {
  productId: string;
  cityRef: string;
  warehouseRefA: string;
  warehouseRefB: string;
};

async function seedCheckoutShippingData(): Promise<SeedData> {
  const productId = crypto.randomUUID();
  const cityRef = crypto.randomUUID();
  const warehouseRefA = crypto.randomUUID();
  const warehouseRefB = crypto.randomUUID();

  await db.insert(products).values({
    id: productId,
    slug: `checkout-shipping-${productId.slice(0, 8)}`,
    title: 'Checkout Shipping Test Product',
    imageUrl: 'https://example.com/shipping-test.png',
    price: '10.00',
    currency: 'USD',
    isActive: true,
    stock: 50,
    sizes: [],
    colors: [],
  } as any);

  await db.insert(productPrices).values([
    {
      id: crypto.randomUUID(),
      productId,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: '10.00',
      originalPrice: null,
    },
    {
      id: crypto.randomUUID(),
      productId,
      currency: 'UAH',
      priceMinor: 4000,
      originalPriceMinor: null,
      price: '40.00',
      originalPrice: null,
    },
  ] as any);

  await db.insert(npCities).values({
    ref: cityRef,
    nameUa: 'Kyiv',
    nameRu: 'Kiev',
    area: 'Kyivska',
    region: 'Kyiv',
    settlementType: 'City',
    isActive: true,
  });

  await db.insert(npWarehouses).values([
    {
      ref: warehouseRefA,
      cityRef: cityRef,
      settlementRef: cityRef,
      number: '1',
      type: 'Branch',
      name: 'Warehouse 1',
      address: 'Address 1',
      isPostMachine: false,
      isActive: true,
    },
    {
      ref: warehouseRefB,
      cityRef: cityRef,
      settlementRef: cityRef,
      number: '2',
      type: 'Branch',
      name: 'Warehouse 2',
      address: 'Address 2',
      isPostMachine: false,
      isActive: true,
    },
  ] as any);

  return {
    productId,
    cityRef,
    warehouseRefA,
    warehouseRefB,
  };
}

async function cleanupSeedData(data: SeedData, orderIds: string[]) {
  for (const orderId of orderIds) {
    await db.delete(orderShipping).where(eq(orderShipping.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  await db
    .delete(inventoryMoves)
    .where(eq(inventoryMoves.productId, data.productId));
  await db.delete(orderItems).where(eq(orderItems.productId, data.productId));
  await db
    .delete(productPrices)
    .where(eq(productPrices.productId, data.productId));
  await db.delete(npWarehouses).where(eq(npWarehouses.ref, data.warehouseRefA));
  await db.delete(npWarehouses).where(eq(npWarehouses.ref, data.warehouseRefB));
  await db.delete(npCities).where(eq(npCities.ref, data.cityRef));
  await db.delete(products).where(eq(products.id, data.productId));
}

describe('checkout shipping phase 3', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
    vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
    vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');
    vi.stubEnv('NP_API_KEY', 'np_test_checkout_shipping_phase3');
    vi.stubEnv('NP_SENDER_CITY_REF', 'np_sender_city_checkout_shipping_phase3');
    vi.stubEnv(
      'NP_SENDER_WAREHOUSE_REF',
      'np_sender_warehouse_checkout_shipping_phase3'
    );
    vi.stubEnv('NP_SENDER_REF', 'np_sender_checkout_shipping_phase3');
    vi.stubEnv(
      'NP_SENDER_CONTACT_REF',
      'np_sender_contact_checkout_shipping_phase3'
    );
    vi.stubEnv('NP_SENDER_NAME', 'Checkout Shipping Phase 3 Sender');
    vi.stubEnv('NP_SENDER_PHONE', '+380500000001');
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it('uses the authoritative storefront UAH currency for shipping checkout regardless of locale', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const result = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'en-US',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
          },
        },
      });
      createdOrderIds.push(result.order.id);

      expect(result.isNew).toBe(true);
      expect(result.order.currency).toBe('UAH');
      expect(result.order.totalAmountMinor).toBe(4500);

      const [orderRow] = await db
        .select({
          id: orders.id,
          currency: orders.currency,
          shippingAmountMinor: orders.shippingAmountMinor,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));

      expect(orderRow).toEqual({
        id: result.order.id,
        currency: 'UAH',
        shippingAmountMinor: 500,
        totalAmountMinor: 4500,
      });
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('rejects warehouse-city mismatch', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];
    const otherCityRef = crypto.randomUUID();
    const otherWarehouseRef = crypto.randomUUID();

    await db.insert(npCities).values({
      ref: otherCityRef,
      nameUa: 'Lviv',
      nameRu: 'Lvov',
      area: 'Lvivska',
      region: 'Lviv',
      settlementType: 'City',
      isActive: true,
    } as any);

    await db.insert(npWarehouses).values({
      ref: otherWarehouseRef,
      cityRef: otherCityRef,
      settlementRef: otherCityRef,
      number: '99',
      type: 'Branch',
      name: 'Warehouse Other City',
      address: 'Other Address',
      isPostMachine: false,
      isActive: true,
    } as any);

    try {
      const idem = crypto.randomUUID();
      const promise = createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: otherWarehouseRef,
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
          },
        },
      });

      await expect(promise).rejects.toBeInstanceOf(InvalidPayloadError);
      await expect(promise).rejects.toHaveProperty(
        'code',
        'INVALID_SHIPPING_ADDRESS'
      );

      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));
      expect(rows.length).toBe(0);
    } finally {
      await db
        .delete(npWarehouses)
        .where(eq(npWarehouses.ref, otherWarehouseRef));
      await db.delete(npCities).where(eq(npCities.ref, otherCityRef));
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('rejects NP_LOCKER for non-locker warehouse', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const promise = createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_LOCKER',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Test User',
            phone: '+380501112233',
          },
        },
      });

      await expect(promise).rejects.toBeInstanceOf(InvalidPayloadError);
      await expect(promise).rejects.toHaveProperty(
        'code',
        'INVALID_SHIPPING_ADDRESS'
      );

      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));
      expect(rows.length).toBe(0);
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('rejects NP_COURIER without addressLine1', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const promise = createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_COURIER',
          selection: {
            cityRef: seed.cityRef,
          },
          recipient: {
            fullName: 'Courier User',
            phone: '+380501112233',
          },
        },
      });

      await expect(promise).rejects.toBeInstanceOf(InvalidPayloadError);
      await expect(promise).rejects.toHaveProperty(
        'code',
        'INVALID_SHIPPING_ADDRESS'
      );

      const rows = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));
      expect(rows.length).toBe(0);
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('persists shipping summary fields + order_shipping snapshot', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const result = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
            email: 'alice@example.com',
            comment: 'ring me',
          },
        },
      });

      createdOrderIds.push(result.order.id);

      const [orderRow] = await db
        .select({
          totalAmountMinor: orders.totalAmountMinor,
          itemsSubtotalMinor: orders.itemsSubtotalMinor,
          shippingRequired: orders.shippingRequired,
          shippingPayer: orders.shippingPayer,
          shippingProvider: orders.shippingProvider,
          shippingMethodCode: orders.shippingMethodCode,
          shippingStatus: orders.shippingStatus,
          shippingAmountMinor: orders.shippingAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, result.order.id))
        .limit(1);

      expect(orderRow).toMatchObject({
        totalAmountMinor: 4500,
        itemsSubtotalMinor: 4000,
        shippingRequired: true,
        shippingPayer: 'customer',
        shippingProvider: 'nova_poshta',
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingStatus: 'pending',
        shippingAmountMinor: 500,
      });

      const [shippingRow] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, result.order.id))
        .limit(1);

      expect(shippingRow).toBeTruthy();
      expect((shippingRow?.shippingAddress as any)?.selection?.cityRef).toBe(
        seed.cityRef
      );
      expect(
        (shippingRow?.shippingAddress as any)?.selection?.warehouseRef
      ).toBe(seed.warehouseRefA);
      expect((shippingRow?.shippingAddress as any)?.quote?.amountMinor).toBe(
        500
      );
      expect((shippingRow?.shippingAddress as any)?.recipient?.fullName).toBe(
        'Alice'
      );
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('idempotency replays only when shipping recipient data is materially identical', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const first = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
          },
        },
      });
      createdOrderIds.push(first.order.id);

      const second = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
          },
        },
      });

      expect(second.isNew).toBe(false);
      expect(second.order.id).toBe(first.order.id);

      const matchedRows = await db
        .select({
          id: orders.id,
          idempotencyKey: orders.idempotencyKey,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));

      expect(matchedRows).toHaveLength(1);

      const [shippingRow] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, first.order.id))
        .limit(1);

      expect((shippingRow?.shippingAddress as any)?.recipient?.fullName).toBe(
        'Alice'
      );

      await expect(
        createOrderWithItems({
          idempotencyKey: idem,
          userId: null,
          locale: 'uk-UA',
          country: 'UA',
          items: [{ productId: seed.productId, quantity: 1 }],
          legalConsent: createTestLegalConsent(),
          shipping: {
            provider: 'nova_poshta',
            methodCode: 'NP_WAREHOUSE',
            selection: {
              cityRef: seed.cityRef,
              warehouseRef: seed.warehouseRefA,
            },
            recipient: {
              fullName: 'Bob',
              phone: '+380509998877',
              email: 'bob@example.com',
              comment: 'Call me on arrival',
            },
          },
        })
      ).rejects.toBeInstanceOf(IdempotencyConflictError);

      const [shippingRowAfterRecipientConflict] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, first.order.id))
        .limit(1);

      expect(
        (shippingRowAfterRecipientConflict?.shippingAddress as any)?.recipient
      ).toMatchObject({
        fullName: 'Alice',
        phone: '+380501112233',
      });

      const rowsAfterRecipientConflict = await db
        .select({
          id: orders.id,
          idempotencyKey: orders.idempotencyKey,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idem));

      expect(rowsAfterRecipientConflict).toHaveLength(1);

      await expect(
        createOrderWithItems({
          idempotencyKey: idem,
          userId: null,
          locale: 'uk-UA',
          country: 'UA',
          items: [{ productId: seed.productId, quantity: 1 }],
          legalConsent: createTestLegalConsent(),
          shipping: {
            provider: 'nova_poshta',
            methodCode: 'NP_WAREHOUSE',
            selection: {
              cityRef: seed.cityRef,
              warehouseRef: seed.warehouseRefB,
            },
            recipient: {
              fullName: 'Alice',
              phone: '+380501112233',
            },
          },
        })
      ).rejects.toBeInstanceOf(IdempotencyConflictError);
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('treats blank optional shipping recipient fields as replay-equivalent nulls', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      const first = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
            email: '',
            comment: '   ',
          },
        },
      });
      createdOrderIds.push(first.order.id);

      const replay = await createOrderWithItems({
        idempotencyKey: idem,
        userId: null,
        locale: 'uk-UA',
        country: 'UA',
        items: [{ productId: seed.productId, quantity: 1 }],
        legalConsent: createTestLegalConsent(),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRefA,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
            email: '   ',
            comment: '',
          },
        },
      });

      expect(replay.isNew).toBe(false);
      expect(replay.order.id).toBe(first.order.id);

      const [shippingRow] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, first.order.id))
        .limit(1);

      expect((shippingRow?.shippingAddress as any)?.recipient).toMatchObject({
        fullName: 'Alice',
        phone: '+380501112233',
        email: null,
        comment: null,
      });
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);
});
