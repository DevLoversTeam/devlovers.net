// C:\Users\milka\devlovers.net\frontend\lib\tests\checkout-currency-policy.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import crypto from 'crypto';


process.env.STRIPE_PAYMENTS_ENABLED = 'false';
process.env.STRIPE_SECRET_KEY = '';
process.env.STRIPE_WEBHOOK_SECRET = '';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null, // guest
  };
});


vi.mock('@/lib/env/stripe', () => ({
  isPaymentsEnabled: () => false,
}));

const createPaymentIntentMock = vi.fn((..._args: any[]) => {
  throw new Error('Stripe should not be called in this test (payments disabled).');
});

vi.mock('@/lib/psp/stripe', () => ({
  createPaymentIntent: (...args: any[]) => createPaymentIntentMock(...args),
  retrievePaymentIntent: (..._args: any[]) => {
    throw new Error('Stripe should not be called in this test (payments disabled).');
  },
}));


// checkout-currency-policy.test.ts

const logErrorMock = vi.fn((..._args: any[]) => undefined);
const logWarnMock = vi.fn((..._args: any[]) => undefined);

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<typeof import('@/lib/logging')>('@/lib/logging');
  return {
    ...actual,
    logError: (...args: any[]) => logErrorMock(...args),
    logWarn: (...args: any[]) => logWarnMock(...args),
  };
});



import { db } from '@/db';
import { products, productPrices, orders } from '@/db/schema';

let POST: (req: NextRequest) => Promise<Response>;

const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run DB-mutating tests in production environment.');
  }
});

beforeAll(async () => {
  // Import route after env + mocks are set
  const mod = await import('@/app/api/shop/checkout/route');
  POST = mod.POST;
});

afterAll(async () => {
  // delete orders first (cascade order_items)
  if (createdOrderIds.length) {
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  if (createdProductIds.length) {
    await db
      .delete(productPrices)
      .where(inArray(productPrices.productId, createdProductIds));
    await db.delete(products).where(inArray(products.id, createdProductIds));
  }
});

function makeIdempotencyKey(): string {
  // 36 chars, allowed by your schema
  return crypto.randomUUID();
}

function makeCheckoutRequest(
  payload: unknown,
  opts: { idempotencyKey: string; acceptLanguage: string }
) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Idempotency-Key': opts.idempotencyKey,
    'Accept-Language': opts.acceptLanguage,
  });

  return new NextRequest(
    new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
  );
}

async function seedProduct(options: {
  slug: string;
  title: string;
  stock: number;
  prices: Array<{ currency: 'USD' | 'UAH'; priceMinor: number; price: string }>;
}) {
  const [p] = await db
    .insert(products)
    .values({
      slug: options.slug,
      title: options.title,
      description: null,
      imageUrl: 'https://example.com/img.png',
      imagePublicId: null,

      // legacy mirror required by schema
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
      stock: options.stock,
      sku: null,
    })
    .returning();

  if (!p) throw new Error('seedProduct: failed to insert product');

  await db.insert(productPrices).values(
    options.prices.map(row => ({
      productId: p.id,
      currency: row.currency,
      priceMinor: row.priceMinor,
      originalPriceMinor: null,
      price: row.price,
      originalPrice: null,
    }))
  );

  createdProductIds.push(p.id);
  return p.id;
}

async function debugIfNotExpected(res: Response, expectedStatus: number) {
  if (res.status === expectedStatus) return;

  const text = await res.text().catch(() => '<failed to read body>');
  // Keep output minimal but decisive
  console.log('checkout failed', { status: res.status, body: text });
  console.log('logError calls', logErrorMock.mock.calls);
  console.log('stripe createPaymentIntent calls', createPaymentIntentMock.mock.calls.length);
}

describe('P0-CUR-3 checkout currency policy', () => {
  it('locale uk -> order.currency UAH and totals correct', async () => {
    const slug = `t-uk-${crypto.randomUUID()}`;
    const productId = await seedProduct({
      slug,
      title: 'Test Product UK',
      stock: 10,
      prices: [
        { currency: 'USD', priceMinor: 6700, price: '67.00' },
        { currency: 'UAH', priceMinor: 10000, price: '100.00' },
      ],
    });

    const req = makeCheckoutRequest(
      { items: [{ productId, quantity: 1 }] },
      { idempotencyKey: makeIdempotencyKey(), acceptLanguage: 'uk-UA,uk;q=0.9' }
    );

    const res = await POST(req);
    await debugIfNotExpected(res, 201);
    expect(res.status).toBe(201);

    const json = await res.json();
    createdOrderIds.push(json.order.id);

    expect(json.order.currency).toBe('UAH');
    expect(json.order.totalAmount).toBe(100);
  });

  it('locale en -> order.currency USD and totals correct', async () => {
    const slug = `t-en-${crypto.randomUUID()}`;
    const productId = await seedProduct({
      slug,
      title: 'Test Product EN',
      stock: 10,
      prices: [
        { currency: 'USD', priceMinor: 6700, price: '67.00' },
        { currency: 'UAH', priceMinor: 10000, price: '100.00' },
      ],
    });

    const req = makeCheckoutRequest(
      { items: [{ productId, quantity: 1 }] },
      { idempotencyKey: makeIdempotencyKey(), acceptLanguage: 'en-US,en;q=0.9' }
    );

    const res = await POST(req);
    await debugIfNotExpected(res, 201);
    expect(res.status).toBe(201);

    const json = await res.json();
    createdOrderIds.push(json.order.id);

    expect(json.order.currency).toBe('USD');
    expect(json.order.totalAmount).toBe(67);
  });

  it('missing price for currency -> 400 PRICE_CONFIG_ERROR', async () => {
    const slug = `t-missing-${crypto.randomUUID()}`;
    const productId = await seedProduct({
      slug,
      title: 'Test Product Missing UAH',
      stock: 10,
      prices: [{ currency: 'USD', priceMinor: 6700, price: '67.00' }], // no UAH row
    });

    const req = makeCheckoutRequest(
      { items: [{ productId, quantity: 1 }] },
      { idempotencyKey: makeIdempotencyKey(), acceptLanguage: 'uk-UA,uk;q=0.9' }
    );

    const res = await POST(req);
    await debugIfNotExpected(res, 400);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.code).toBe('PRICE_CONFIG_ERROR');
    expect(json.details?.productId).toBe(productId);
    expect(json.details?.currency).toBe('UAH');
  }, 30_000);
});
