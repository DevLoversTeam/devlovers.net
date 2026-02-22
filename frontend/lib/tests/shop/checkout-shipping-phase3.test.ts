import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  npCities,
  npWarehouses,
  orderShipping,
  orders,
  productPrices,
  products,
} from '@/db/schema/shop';
import {
  IdempotencyConflictError,
  InvalidPayloadError,
} from '@/lib/services/errors';
import { createOrderWithItems } from '@/lib/services/orders';
import { resetEnvCache } from '@/lib/env';

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
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  await db.delete(npWarehouses).where(eq(npWarehouses.ref, data.warehouseRefA));
  await db.delete(npWarehouses).where(eq(npWarehouses.ref, data.warehouseRefB));
  await db.delete(npCities).where(eq(npCities.ref, data.cityRef));
  await db.delete(products).where(eq(products.id, data.productId));
}

describe('checkout shipping phase 3', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'https://example.com/db');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it('rejects NP shipping for unsupported checkout currency', async () => {
    const seed = await seedCheckoutShippingData();
    const createdOrderIds: string[] = [];

    try {
      const idem = crypto.randomUUID();
      await expect(
        createOrderWithItems({
          idempotencyKey: idem,
          userId: null,
          locale: 'en-US',
          country: 'UA',
          items: [{ productId: seed.productId, quantity: 1 }],
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
        })
      ).rejects.toMatchObject<Partial<InvalidPayloadError>>({
        code: 'SHIPPING_CURRENCY_UNSUPPORTED',
      });

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
        shippingRequired: true,
        shippingPayer: 'customer',
        shippingProvider: 'nova_poshta',
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingStatus: 'pending',
        shippingAmountMinor: null,
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
      expect((shippingRow?.shippingAddress as any)?.selection?.warehouseRef).toBe(
        seed.warehouseRefA
      );
      expect((shippingRow?.shippingAddress as any)?.recipient?.fullName).toBe(
        'Alice'
      );
    } finally {
      await cleanupSeedData(seed, createdOrderIds);
    }
  }, 60_000);

  it('idempotency excludes recipient PII but includes shipping refs', async () => {
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
          },
        },
      });

      expect(second.isNew).toBe(false);
      expect(second.order.id).toBe(first.order.id);

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
});
