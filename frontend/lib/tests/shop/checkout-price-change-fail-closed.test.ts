import crypto from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { rehydrateCartItems } from '@/lib/services/products';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';
import { TEST_LEGAL_CONSENT } from '@/lib/tests/shop/test-legal-consent';

vi.mock('@/lib/auth', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null,
  };
});

vi.mock('@/lib/env/stripe', async () => {
  const actual = await vi.importActual<any>('@/lib/env/stripe');
  return {
    ...actual,
    isPaymentsEnabled: () => true,
  };
});

vi.mock('@/lib/services/orders/payment-attempts', async () => {
  resetEnvCache();
  const actual = await vi.importActual<any>(
    '@/lib/services/orders/payment-attempts'
  );
  return {
    ...actual,
    ensureStripePaymentIntentForOrder: vi.fn(
      async (args: { orderId: string }) => ({
        paymentIntentId: `pi_test_${args.orderId.slice(0, 8)}`,
        clientSecret: `cs_test_${args.orderId.slice(0, 8)}`,
        attemptId: crypto.randomUUID(),
        attemptNumber: 1,
      })
    ),
  };
});

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;
const __prevStripeSecret = process.env.STRIPE_SECRET_KEY;
const __prevStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const __prevStripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const __prevAppOrigin = process.env.APP_ORIGIN;

let POST: (req: NextRequest) => Promise<Response>;

const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_SECRET_KEY = 'sk_test_checkout_price_change';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_checkout_price_change';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
    'pk_test_checkout_price_change';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  resetEnvCache();
});

beforeAll(async () => {
  const mod = await import('@/app/api/shop/checkout/route');
  POST = mod.POST;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db
      .delete(inventoryMoves)
      .where(inArray(inventoryMoves.orderId, createdOrderIds));
    await db
      .delete(orderItems)
      .where(inArray(orderItems.orderId, createdOrderIds));
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }

  if (createdProductIds.length) {
    await db
      .delete(inventoryMoves)
      .where(inArray(inventoryMoves.productId, createdProductIds));
    await db
      .delete(orderItems)
      .where(inArray(orderItems.productId, createdProductIds));
    await db
      .delete(productPrices)
      .where(inArray(productPrices.productId, createdProductIds));
    await db.delete(products).where(inArray(products.id, createdProductIds));
  }

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

async function seedProduct(priceMinor: number): Promise<string> {
  const slug = `checkout-price-change-${crypto.randomUUID()}`;
  const price = (priceMinor / 100).toFixed(2);

  const [product] = await db
    .insert(products)
    .values({
      slug,
      title: 'Checkout price change test product',
      description: null,
      imageUrl: 'https://example.com/checkout-price-change.png',
      imagePublicId: null,
      price,
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
      sku: null,
    })
    .returning({ id: products.id });

  if (!product) throw new Error('seedProduct: failed to insert product');

  await db.insert(productPrices).values({
    productId: product.id,
    currency: 'UAH',
    priceMinor,
    originalPriceMinor: null,
    price,
    originalPrice: null,
  });

  createdProductIds.push(product.id);
  return product.id;
}

function makeCheckoutRequest(args: {
  idempotencyKey: string;
  productId: string;
  pricingFingerprint: string;
}) {
  return new NextRequest(
    new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
        'Accept-Language': 'en-US,en;q=0.9',
        'X-Forwarded-For': deriveTestIpFromIdemKey(args.idempotencyKey),
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
        pricingFingerprint: args.pricingFingerprint,
        legalConsent: TEST_LEGAL_CONSENT,
        items: [{ productId: args.productId, quantity: 1 }],
      }),
    })
  );
}

describe('checkout fail-closed for changed price mismatch', () => {
  it('rejects checkout when pricing fingerprint is missing and creates no order', async () => {
    const productId = await seedProduct(900);
    const idempotencyKey = crypto.randomUUID();

    const response = await POST(
      new NextRequest(
        new Request('http://localhost/api/shop/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'Accept-Language': 'en-US,en;q=0.9',
            'X-Forwarded-For': deriveTestIpFromIdemKey(idempotencyKey),
            Origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            paymentProvider: 'stripe',
            paymentMethod: 'stripe_card',
            legalConsent: TEST_LEGAL_CONSENT,
            items: [{ productId, quantity: 1 }],
          }),
        })
      )
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('CHECKOUT_PRICE_CHANGED');
    expect(json.message).toBe(
      'Cart pricing changed. Refresh your cart and try again.'
    );
    expect(json.details?.reason).toBe('PRICING_FINGERPRINT_MISSING');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();
  });

  it('rejects a stale pricing fingerprint after price change and creates no order', async () => {
    const productId = await seedProduct(900);
    const quote = await rehydrateCartItems([{ productId, quantity: 1 }], 'UAH');
    const pricingFingerprint = quote.summary.pricingFingerprint;

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    await db
      .update(productPrices)
      .set({
        priceMinor: 1200,
        price: '12.00',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productPrices.productId, productId),
          eq(productPrices.currency, 'UAH')
        )
      );

    const idempotencyKey = crypto.randomUUID();
    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId,
        pricingFingerprint: pricingFingerprint!,
      })
    );

    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json.code).toBe('CHECKOUT_PRICE_CHANGED');
    expect(json.message).toBe(
      'Cart pricing changed. Refresh your cart and try again.'
    );
    expect(json.details?.reason).toBe('PRICING_FINGERPRINT_MISMATCH');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();
  });

  it('accepts checkout when the authoritative pricing fingerprint is unchanged', async () => {
    const productId = await seedProduct(900);
    const quote = await rehydrateCartItems([{ productId, quantity: 1 }], 'UAH');
    const pricingFingerprint = quote.summary.pricingFingerprint;

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    const idempotencyKey = crypto.randomUUID();
    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId,
        pricingFingerprint: pricingFingerprint!,
      })
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.order?.totalAmount).toBe(9);

    const orderId = typeof json.order?.id === 'string' ? json.order.id : null;
    expect(orderId).toBeTruthy();

    if (orderId) {
      createdOrderIds.push(orderId);
    }
  });
});
