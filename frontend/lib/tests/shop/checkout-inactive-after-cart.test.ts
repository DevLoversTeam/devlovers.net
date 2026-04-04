import crypto from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import {
  afterAll,
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
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema';
import { getShopLegalVersions } from '@/lib/env/shop-legal';
import { rehydrateCartItems } from '@/lib/services/products';
import { toDbMoney } from '@/lib/shop/money';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/env/stripe', async () => {
  const actual = await vi.importActual<any>('@/lib/env/stripe');
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
    ensureStripePaymentIntentForOrder: vi.fn(),
  };
});

import { POST } from '@/app/api/shop/checkout/route';
import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';

const ensureStripePaymentIntentForOrderMock =
  ensureStripePaymentIntentForOrder as unknown as ReturnType<typeof vi.fn>;

const createdProductIds: string[] = [];
type ProductInsertRow = typeof products.$inferInsert;
type ProductPriceInsertRow = typeof productPrices.$inferInsert;

beforeAll(() => {
  vi.stubEnv('RATE_LIMIT_DISABLED', '1');
  vi.stubEnv('PAYMENTS_ENABLED', 'true');
  vi.stubEnv('STRIPE_PAYMENTS_ENABLED', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_checkout_inactive_after_cart');
  vi.stubEnv(
    'STRIPE_WEBHOOK_SECRET',
    'whsec_test_checkout_inactive_after_cart'
  );
});

afterAll(async () => {
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
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  ensureStripePaymentIntentForOrderMock.mockReset();
});

async function seedCheckoutProduct() {
  const productId = crypto.randomUUID();
  const now = new Date();

  const productRow: ProductInsertRow = {
    id: productId,
    slug: `inactive-after-cart-${productId.slice(0, 8)}`,
    title: 'Inactive After Cart Product',
    description: null,
    imageUrl: 'https://example.com/inactive-after-cart.png',
    imagePublicId: null,
    price: toDbMoney(4000),
    originalPrice: null,
    currency: 'USD',
    category: null,
    type: null,
    colors: [],
    sizes: [],
    badge: 'NONE',
    isActive: true,
    isFeatured: false,
    stock: 7,
    sku: `inactive-after-cart-${productId.slice(0, 8)}`,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(products).values(productRow);

  const priceRow: ProductPriceInsertRow = {
    id: crypto.randomUUID(),
    productId,
    currency: 'UAH',
    priceMinor: 4000,
    originalPriceMinor: null,
    price: toDbMoney(4000),
    originalPrice: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(productPrices).values(priceRow);

  createdProductIds.push(productId);
  return { productId };
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
        'content-type': 'application/json',
        'accept-language': 'uk-UA,uk;q=0.9',
        'idempotency-key': args.idempotencyKey,
        'x-forwarded-for': deriveTestIpFromIdemKey(args.idempotencyKey),
        origin: 'http://localhost:3000',
      },
      body: JSON.stringify({
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
        pricingFingerprint: args.pricingFingerprint,
        legalConsent: canonicalLegalConsent(),
        items: [{ productId: args.productId, quantity: 1 }],
      }),
    })
  );
}

function canonicalLegalConsent() {
  const versions = getShopLegalVersions();
  return {
    termsAccepted: true,
    privacyAccepted: true,
    termsVersion: versions.termsVersion,
    privacyVersion: versions.privacyVersion,
  };
}

describe('checkout inactive-after-cart fail-closed contract', () => {
  it('rejects checkout when a previously active cart product becomes inactive before processing', async () => {
    const { productId } = await seedCheckoutProduct();

    const quote = await rehydrateCartItems([{ productId, quantity: 1 }], 'UAH');
    const pricingFingerprint = quote.summary.pricingFingerprint;

    expect(typeof pricingFingerprint).toBe('string');
    expect(pricingFingerprint).toHaveLength(64);

    const [beforeRow] = await db
      .select({ stock: products.stock, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(beforeRow).toMatchObject({ stock: 7, isActive: true });

    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, productId));

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
    expect(json.code).toBe('INVALID_PAYLOAD');
    expect(json.message).toBe('Some products are unavailable or inactive.');

    const [orderRow] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.idempotencyKey, idempotencyKey))
      .limit(1);

    expect(orderRow).toBeFalsy();

    const orderItemRows = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, productId));

    expect(orderItemRows).toHaveLength(0);

    const moveRows = await db
      .select({ id: inventoryMoves.id, type: inventoryMoves.type })
      .from(inventoryMoves)
      .where(eq(inventoryMoves.productId, productId));

    expect(moveRows).toHaveLength(0);
    expect(ensureStripePaymentIntentForOrderMock).not.toHaveBeenCalled();

    const [afterRow] = await db
      .select({ stock: products.stock, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(afterRow).toMatchObject({ stock: 7, isActive: false });
  });
});
