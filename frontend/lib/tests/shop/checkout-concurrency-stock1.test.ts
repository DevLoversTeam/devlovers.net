import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;

import { db } from '@/db';
import {
  inventoryMoves,
  orderItems,
  orders,
  productPrices,
  products,
} from '@/db/schema/shop';
import { resetEnvCache } from '@/lib/env';
import { rehydrateCartItems } from '@/lib/services/products';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

import { createTestLegalConsent } from './test-legal-consent';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<any>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null,
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

type CheckoutResult = {
  status: number;
  json: Record<string, unknown> | null;
};

async function readJsonSafe(res: Response) {
  try {
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function makeCheckoutRequest(args: {
  productId: string;
  idempotencyKey: string;
  pricingFingerprint: string;
}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Idempotency-Key': args.idempotencyKey,
    'Accept-Language': 'uk-UA,uk;q=0.9',
    'X-Forwarded-For': deriveTestIpFromIdemKey(args.idempotencyKey),
    Origin: 'http://localhost:3000',
  });

  return new NextRequest(
    new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        paymentProvider: 'stripe',
        paymentMethod: 'stripe_card',
        items: [{ productId: args.productId, quantity: 1 }],
        pricingFingerprint: args.pricingFingerprint,
        legalConsent: createTestLegalConsent(),
      }),
    })
  );
}

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;
});

describe('P0-8.10.1 checkout concurrency: stock=1, two parallel checkouts', () => {
  const stripeKeys = [
    'PAYMENTS_ENABLED',
    'STRIPE_PAYMENTS_ENABLED',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'APP_ORIGIN',
  ] as const;

  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of stripeKeys) originalEnv[key] = process.env[key];
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_SECRET_KEY = 'sk_test_concurrency';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_concurrency';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_concurrency';
    process.env.APP_ORIGIN = 'http://localhost:3000';
    resetEnvCache();
  });

  afterAll(() => {
    for (const key of stripeKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  });

  it('allows exactly one winning checkout for the last unit and keeps the losing path fail-closed', async () => {
    const productId = crypto.randomUUID();
    const slug = `checkout-concurrency-${productId.slice(0, 8)}`;
    const cleanupErrors: unknown[] = [];

    try {
      const now = new Date();
      await db.insert(products).values({
        id: productId,
        slug,
        title: `Concurrency stock=1 (${slug})`,
        description: null,
        imageUrl: 'https://example.com/concurrency.png',
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
        stock: 1,
        sku: null,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(productPrices).values([
        {
          id: crypto.randomUUID(),
          productId,
          currency: 'USD',
          priceMinor: 1000,
          originalPriceMinor: null,
          price: '10.00',
          originalPrice: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: crypto.randomUUID(),
          productId,
          currency: 'UAH',
          priceMinor: 4200,
          originalPriceMinor: null,
          price: '42.00',
          originalPrice: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const quote = await rehydrateCartItems(
        [{ productId, quantity: 1 }],
        'UAH'
      );
      const pricingFingerprint = quote.summary.pricingFingerprint;

      expect(typeof pricingFingerprint).toBe('string');
      expect(pricingFingerprint).toHaveLength(64);

      if (
        typeof pricingFingerprint !== 'string' ||
        pricingFingerprint.length !== 64
      ) {
        throw new Error(
          'Expected authoritative pricing fingerprint for concurrency proof'
        );
      }
      const authoritativePricingFingerprint = pricingFingerprint;

      const { POST: checkoutPOST } =
        await import('@/app/api/shop/checkout/route');

      async function callCheckout(
        idempotencyKey: string
      ): Promise<CheckoutResult> {
        const req = await makeCheckoutRequest({
          productId,
          idempotencyKey,
          pricingFingerprint: authoritativePricingFingerprint,
        });
        const res = await checkoutPOST(req);
        const json = await readJsonSafe(res);
        return { status: res.status, json };
      }

      const idemA = crypto.randomUUID();
      const idemB = crypto.randomUUID();

      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });

      const p1 = (async () => {
        await gate;
        return callCheckout(idemA);
      })();

      const p2 = (async () => {
        await gate;
        return callCheckout(idemB);
      })();

      release();

      const [r1, r2] = await Promise.all([p1, p2]);
      const results = [r1, r2];

      const successResults = results.filter(result => result.status === 201);
      const failedResults = results.filter(result => result.status === 422);

      expect(successResults).toHaveLength(1);
      expect(failedResults).toHaveLength(1);
      expect(
        ['OUT_OF_STOCK', 'INSUFFICIENT_STOCK'].includes(
          String(failedResults[0]?.json?.code ?? '')
        )
      ).toBe(true);

      const orderRows = await db
        .select({
          id: orders.id,
          idempotencyKey: orders.idempotencyKey,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          paymentStatus: orders.paymentStatus,
          failureCode: orders.failureCode,
          stockRestored: orders.stockRestored,
        })
        .from(orders)
        .where(inArray(orders.idempotencyKey, [idemA, idemB]));

      expect(orderRows.length).toBeGreaterThanOrEqual(1);
      expect(orderRows.length).toBeLessThanOrEqual(2);

      const winner = orderRows.find(row => row.status === 'INVENTORY_RESERVED');
      const loser = orderRows.find(
        row =>
          row.failureCode === 'OUT_OF_STOCK' ||
          row.failureCode === 'INSUFFICIENT_STOCK'
      );

      expect(winner).toBeTruthy();
      expect(winner?.inventoryStatus).toBe('reserved');
      expect(winner?.paymentStatus).toBe('pending');
      expect(winner?.stockRestored).toBe(false);

      if (loser) {
        expect(loser.status).toBe('INVENTORY_FAILED');
        expect(loser.inventoryStatus).toBe('released');
        expect(loser.paymentStatus).toBe('failed');
        expect(loser.stockRestored).toBe(true);
      }

      expect(
        orderRows.filter(row => row.inventoryStatus === 'reserved')
      ).toHaveLength(1);
      expect(
        orderRows.filter(row => row.inventoryStatus === 'reserving')
      ).toHaveLength(0);
      expect(
        orderRows.filter(row => row.inventoryStatus === 'release_pending')
      ).toHaveLength(0);

      const [productRow] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(productRow?.stock).toBe(0);
      expect(productRow?.stock).toBeGreaterThanOrEqual(0);

      const moveRows = await db
        .select({
          orderId: inventoryMoves.orderId,
          type: inventoryMoves.type,
          quantity: inventoryMoves.quantity,
          moveKey: inventoryMoves.moveKey,
        })
        .from(inventoryMoves)
        .where(eq(inventoryMoves.productId, productId));

      const reserveMoves = moveRows.filter(row => row.type === 'reserve');
      const releaseMoves = moveRows.filter(row => row.type === 'release');

      expect(reserveMoves).toHaveLength(1);
      expect(releaseMoves).toHaveLength(0);
      expect(
        reserveMoves.reduce((sum, row) => sum + Math.abs(row.quantity), 0)
      ).toBe(1);
      expect(new Set(reserveMoves.map(row => row.moveKey)).size).toBe(
        reserveMoves.length
      );

      const orderItemRows = await db
        .select({ orderId: orderItems.orderId })
        .from(orderItems)
        .where(eq(orderItems.productId, productId));

      expect(new Set(orderItemRows.map(row => row.orderId)).size).toBe(
        orderRows.length
      );
    } finally {
      try {
        const itemOrderIds = await db
          .select({ orderId: orderItems.orderId })
          .from(orderItems)
          .where(eq(orderItems.productId, productId));

        const orderIds = itemOrderIds.map(row => row.orderId);

        await db.delete(orderItems).where(eq(orderItems.productId, productId));
        await db
          .delete(inventoryMoves)
          .where(eq(inventoryMoves.productId, productId));
        await db
          .delete(productPrices)
          .where(eq(productPrices.productId, productId));

        if (orderIds.length > 0) {
          await db.delete(orders).where(inArray(orders.id, orderIds));
        }

        await db.delete(products).where(eq(products.id, productId));
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      throw cleanupErrors[0];
    }
  }, 30_000);
});
