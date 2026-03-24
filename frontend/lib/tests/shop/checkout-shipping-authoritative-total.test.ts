import crypto from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { db } from '@/db';
import {
  inventoryMoves,
  npCities,
  npWarehouses,
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { rehydrateCartItems } from '@/lib/services/products';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

const enforceRateLimitMock = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({
  getRateLimitSubject: vi.fn(() => 'checkout_shipping_authoritative_subject'),
  enforceRateLimit: (...args: any[]) => enforceRateLimitMock(...args),
  rateLimitResponse: ({ retryAfterSeconds }: { retryAfterSeconds: number }) => {
    const res = NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(retryAfterSeconds));
    res.headers.set('Cache-Control', 'no-store');
    return res;
  },
}));

vi.mock('@/lib/auth', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null,
  };
});

vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: () => true,
}));

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

let POST: (req: NextRequest) => Promise<Response>;
let GET_METHODS: (req: NextRequest) => Promise<Response>;

const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCityRefs: string[] = [];
const createdWarehouseRefs: string[] = [];

type SeedData = {
  productId: string;
  cityRef: string;
  warehouseRef: string;
};

beforeAll(async () => {
  const checkoutRoute = await import('@/app/api/shop/checkout/route');
  POST = checkoutRoute.POST;

  const shippingMethodsRoute =
    await import('@/app/api/shop/shipping/methods/route');
  GET_METHODS = shippingMethodsRoute.GET;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  enforceRateLimitMock.mockResolvedValue({ ok: true, remaining: 100 });

  vi.stubEnv('PAYMENTS_ENABLED', 'true');
  vi.stubEnv('STRIPE_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_checkout_shipping_total');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_checkout_shipping_total');
  vi.stubEnv(
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'pk_test_checkout_shipping_total'
  );
  vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
  vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '500');
  vi.stubEnv('SHOP_SHIPPING_NP_LOCKER_AMOUNT_MINOR', '400');
  vi.stubEnv('SHOP_SHIPPING_NP_COURIER_AMOUNT_MINOR', '700');
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
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

  if (createdWarehouseRefs.length) {
    await db
      .delete(npWarehouses)
      .where(inArray(npWarehouses.ref, createdWarehouseRefs));
  }

  if (createdCityRefs.length) {
    await db.delete(npCities).where(inArray(npCities.ref, createdCityRefs));
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
});

async function seedShippingCheckoutData(): Promise<SeedData> {
  const productId = crypto.randomUUID();
  const cityRef = crypto.randomUUID();
  const warehouseRef = crypto.randomUUID();

  await db.insert(products).values({
    id: productId,
    slug: `checkout-shipping-total-${productId.slice(0, 8)}`,
    title: 'Checkout Shipping Total Test Product',
    description: null,
    imageUrl: 'https://example.com/checkout-shipping-total.png',
    imagePublicId: null,
    price: '10.00',
    originalPrice: null,
    currency: 'USD',
    category: null,
    type: null,
    colors: [],
    sizes: [],
    badge: 'NONE',
    isActive: true,
    isFeatured: false,
    stock: 25,
    sku: null,
  } as any);

  await db.insert(productPrices).values({
    id: crypto.randomUUID(),
    productId,
    currency: 'UAH',
    priceMinor: 4000,
    originalPriceMinor: null,
    price: '40.00',
    originalPrice: null,
  } as any);

  await db.insert(npCities).values({
    ref: cityRef,
    nameUa: 'Kyiv',
    nameRu: 'Kiev',
    area: 'Kyivska',
    region: 'Kyiv',
    settlementType: 'City',
    isActive: true,
  } as any);

  await db.insert(npWarehouses).values({
    ref: warehouseRef,
    cityRef,
    settlementRef: cityRef,
    number: '1',
    type: 'Branch',
    name: 'Warehouse 1',
    address: 'Address 1',
    isPostMachine: false,
    isActive: true,
  } as any);

  createdProductIds.push(productId);
  createdCityRefs.push(cityRef);
  createdWarehouseRefs.push(warehouseRef);

  return {
    productId,
    cityRef,
    warehouseRef,
  };
}

async function fetchWarehouseMethodQuote() {
  const response = await GET_METHODS(
    new NextRequest(
      'http://localhost/api/shop/shipping/methods?locale=uk&currency=UAH&country=UA'
    )
  );

  expect(response.status).toBe(200);
  const json = await response.json();
  expect(json.available).toBe(true);

  const warehouseMethod = Array.isArray(json.methods)
    ? json.methods.find((method: any) => method?.methodCode === 'NP_WAREHOUSE')
    : null;

  expect(warehouseMethod).toBeTruthy();
  expect(warehouseMethod.amountMinor).toBe(500);
  expect(warehouseMethod.quoteFingerprint).toMatch(/^[a-f0-9]{64}$/);

  return warehouseMethod as {
    amountMinor: number;
    quoteFingerprint: string;
  };
}

function makeCheckoutRequest(args: {
  idempotencyKey: string;
  productId: string;
  pricingFingerprint: string;
  cityRef: string;
  warehouseRef: string;
  shippingQuoteFingerprint?: string;
  extraBody?: Record<string, unknown>;
}) {
  return new NextRequest(
    new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': args.idempotencyKey,
        'Accept-Language': 'uk-UA,uk;q=0.9',
        'X-Forwarded-For': deriveTestIpFromIdemKey(args.idempotencyKey),
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
        pricingFingerprint: args.pricingFingerprint,
        ...(args.shippingQuoteFingerprint
          ? { shippingQuoteFingerprint: args.shippingQuoteFingerprint }
          : {}),
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: args.cityRef,
            warehouseRef: args.warehouseRef,
          },
          recipient: {
            fullName: 'Alice',
            phone: '+380501112233',
          },
        },
        items: [{ productId: args.productId, quantity: 1 }],
        ...(args.extraBody ?? {}),
      }),
    })
  );
}

describe('checkout authoritative shipping totals', () => {
  it('includes authoritative shipping in the final persisted order total', async () => {
    const seed = await seedShippingCheckoutData();
    const quote = await rehydrateCartItems(
      [{ productId: seed.productId, quantity: 1 }],
      'UAH'
    );
    const warehouseMethod = await fetchWarehouseMethodQuote();
    const pricingFingerprint = quote.summary.pricingFingerprint;

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    const expectedTotalMinor =
      quote.summary.totalAmountMinor + warehouseMethod.amountMinor;
    const idempotencyKey = crypto.randomUUID();
    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId: seed.productId,
        pricingFingerprint: pricingFingerprint!,
        cityRef: seed.cityRef,
        warehouseRef: seed.warehouseRef,
        shippingQuoteFingerprint: warehouseMethod.quoteFingerprint,
      })
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.order.totalAmount).toBe(expectedTotalMinor / 100);

    const [orderRow] = await db
      .select({
        id: orders.id,
        totalAmountMinor: orders.totalAmountMinor,
        itemsSubtotalMinor: orders.itemsSubtotalMinor,
        shippingAmountMinor: orders.shippingAmountMinor,
      })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toMatchObject({
      totalAmountMinor: expectedTotalMinor,
      itemsSubtotalMinor: quote.summary.totalAmountMinor,
      shippingAmountMinor: warehouseMethod.amountMinor,
    });

    if (orderRow?.id) {
      createdOrderIds.push(orderRow.id);
    }
  });

  it('fails closed when shipping quote fingerprint is missing and creates no order', async () => {
    const seed = await seedShippingCheckoutData();
    const quote = await rehydrateCartItems(
      [{ productId: seed.productId, quantity: 1 }],
      'UAH'
    );
    const pricingFingerprint = quote.summary.pricingFingerprint;
    const idempotencyKey = crypto.randomUUID();

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId: seed.productId,
        pricingFingerprint: pricingFingerprint!,
        cityRef: seed.cityRef,
        warehouseRef: seed.warehouseRef,
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe('CHECKOUT_SHIPPING_CHANGED');
    expect(json.message).toBe(
      'Shipping amount changed. Refresh your cart and try again.'
    );
    expect(json.details?.reason).toBe('SHIPPING_QUOTE_FINGERPRINT_MISSING');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();
  });

  it('fails closed when the authoritative shipping amount changes before submit', async () => {
    const seed = await seedShippingCheckoutData();
    const quote = await rehydrateCartItems(
      [{ productId: seed.productId, quantity: 1 }],
      'UAH'
    );
    const warehouseMethod = await fetchWarehouseMethodQuote();
    const pricingFingerprint = quote.summary.pricingFingerprint;

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    vi.stubEnv('SHOP_SHIPPING_NP_WAREHOUSE_AMOUNT_MINOR', '650');
    resetEnvCache();

    const idempotencyKey = crypto.randomUUID();
    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId: seed.productId,
        pricingFingerprint: pricingFingerprint!,
        cityRef: seed.cityRef,
        warehouseRef: seed.warehouseRef,
        shippingQuoteFingerprint: warehouseMethod.quoteFingerprint,
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe('CHECKOUT_SHIPPING_CHANGED');
    expect(json.message).toBe(
      'Shipping amount changed. Refresh your cart and try again.'
    );
    expect(json.details?.reason).toBe('SHIPPING_QUOTE_FINGERPRINT_MISMATCH');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();
  });

  it('rejects client-supplied payable totals and creates no order', async () => {
    const seed = await seedShippingCheckoutData();
    const quote = await rehydrateCartItems(
      [{ productId: seed.productId, quantity: 1 }],
      'UAH'
    );
    const warehouseMethod = await fetchWarehouseMethodQuote();
    const pricingFingerprint = quote.summary.pricingFingerprint;
    const idempotencyKey = crypto.randomUUID();

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    const response = await POST(
      makeCheckoutRequest({
        idempotencyKey,
        productId: seed.productId,
        pricingFingerprint: pricingFingerprint!,
        cityRef: seed.cityRef,
        warehouseRef: seed.warehouseRef,
        shippingQuoteFingerprint: warehouseMethod.quoteFingerprint,
        extraBody: {
          shippingAmountMinor: 1,
          totalAmountMinor: 1,
        },
      })
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe('INVALID_PAYLOAD');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();
  });
});
