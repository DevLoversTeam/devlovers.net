import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;
const __prevStripeSecret = process.env.STRIPE_SECRET_KEY;
const __prevStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const __prevStripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const __prevAppOrigin = process.env.APP_ORIGIN;

import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: vi.fn(async () => null),
  };
});

vi.mock('@/lib/env/stripe', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@/lib/env/stripe');
  return {
    ...actual,
    isPaymentsEnabled: () => true,
  };
});

vi.mock('@/lib/services/orders/payment-attempts', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/orders/payment-attempts'
  );
  return {
    ...actual,
    ensureStripePaymentIntentForOrder: vi.fn(
      async (args: { orderId: string }) => ({
        paymentIntentId: `pi_test_${args.orderId.slice(0, 8)}`,
        clientSecret: `cs_test_${args.orderId.slice(0, 8)}`,
        attemptId: randomUUID(),
        attemptNumber: 1,
      })
    ),
  };
});

type CheckoutResponse = {
  success: boolean;
  orderId?: string;
  order?: { id?: string };
};

function makeJsonRequest(
  url: string,
  body: unknown,
  headers: Record<string, string>
) {
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function cleanupByIds(params: { orderId?: string; productId: string }) {
  const { orderId, productId } = params;

  if (orderId) {
    await db.delete(inventoryMoves).where(eq(inventoryMoves.orderId, orderId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  await db.delete(productPrices).where(eq(productPrices.productId, productId));

  await db.delete(products).where(eq(products.id, productId));
}

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_SECRET_KEY = 'sk_test_snapshot';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_snapshot';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_snapshot';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  resetEnvCache();
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;

  if (__prevPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
  else process.env.PAYMENTS_ENABLED = __prevPaymentsEnabled;

  if (__prevStripePaymentsEnabled === undefined)
    delete process.env.STRIPE_PAYMENTS_ENABLED;
  else process.env.STRIPE_PAYMENTS_ENABLED = __prevStripePaymentsEnabled;

  if (__prevStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = __prevStripeSecret;

  if (__prevStripeWebhookSecret === undefined)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = __prevStripeWebhookSecret;

  if (__prevStripePublishableKey === undefined)
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = __prevStripePublishableKey;

  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;
  resetEnvCache();
});

describe('P0-6 snapshots: order_items immutability', () => {
  it('snapshot fields must not change after products/product_prices update', async () => {
    const productId = randomUUID();
    const priceId = randomUUID();

    const titleV1 = 'Snapshot Test Product';
    const slugV1 = `snapshot-test-${productId.slice(0, 8)}`;
    const skuV1 = `SKU-${productId.slice(0, 8)}`;

    await db.insert(products).values({
      id: productId,
      slug: slugV1,
      title: titleV1,
      description: 'snapshot test',
      imageUrl: 'https://res.cloudinary.com/devlovers/image/upload/v1/test.png',
      imagePublicId: null,
      price: '9.00',
      originalPrice: null,
      currency: 'USD',
      category: null,
      type: null,
      colors: [],
      sizes: [],
      badge: 'NONE',
      isActive: true,
      isFeatured: false,
      stock: 10,
      sku: skuV1,
    });

    await db.insert(productPrices).values({
      id: priceId,
      productId,
      currency: 'USD',
      priceMinor: 900,
      originalPriceMinor: null,
      price: '9.00',
      originalPrice: null,
    });

    const idem = randomUUID();
    const req = makeJsonRequest(
      'http://localhost:3000/api/shop/checkout',
      {
        items: [{ productId, quantity: 1 }],
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
      },
      {
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/json',
        'Idempotency-Key': idem,
        'X-Forwarded-For': deriveTestIpFromIdemKey(idem),
        Origin: 'http://localhost:3000',
      }
    );
    const { POST: checkoutPOST } =
      await import('@/app/api/shop/checkout/route');

    const res = await checkoutPOST(req);

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const json = (await res.json()) as CheckoutResponse;
    expect(json.success).toBe(true);

    const orderId = json.orderId ?? json.order?.id;
    expect(typeof orderId).toBe('string');
    if (!orderId) throw new Error('Missing orderId from checkout response');

    let primaryError: unknown = null;
    let cleanupError: unknown = null;

    try {
      const before = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPriceMinor: orderItems.unitPriceMinor,
          lineTotalMinor: orderItems.lineTotalMinor,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      expect(before.length).toBe(1);
      expect(before[0].productId).toBe(productId);
      expect(before[0].productTitle).toBe(titleV1);
      expect(before[0].productSlug).toBe(slugV1);
      expect(before[0].productSku).toBe(skuV1);
      expect(before[0].unitPriceMinor).toBe(900);
      expect(before[0].lineTotalMinor).toBe(900);
      const titleV2 = `${titleV1} UPDATED`;
      const slugV2 = `${slugV1}-updated`;
      const skuV2 = `${skuV1}-UPDATED`;

      await db
        .update(products)
        .set({
          title: titleV2,
          slug: slugV2,
          sku: skuV2,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await db
        .update(productPrices)
        .set({
          priceMinor: 1000,
          price: '10.00',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productPrices.productId, productId),
            eq(productPrices.currency, 'USD')
          )
        );

      const after = await db
        .select({
          orderId: orderItems.orderId,
          productId: orderItems.productId,
          quantity: orderItems.quantity,
          unitPriceMinor: orderItems.unitPriceMinor,
          lineTotalMinor: orderItems.lineTotalMinor,
          productTitle: orderItems.productTitle,
          productSlug: orderItems.productSlug,
          productSku: orderItems.productSku,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      expect(after.length).toBe(1);

      expect(after[0]).toEqual(before[0]);
    } catch (e) {
      primaryError = e;
      throw e;
    } finally {
      try {
        await cleanupByIds({ orderId, productId });
      } catch (e) {
        cleanupError = e;
        console.error('[test cleanup failed]', { orderId, productId }, e);
      }
    }
    if (!primaryError && cleanupError) {
      throw cleanupError;
    }
  }, 30_000);
});
