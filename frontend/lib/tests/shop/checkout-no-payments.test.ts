import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, productPrices, products } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';
import { getOrSeedActiveTemplateProduct } from '@/lib/tests/helpers/seed-product';

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;
});

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
  };
});

vi.mock('@/lib/env/stripe', async () => {
  const actual = await vi.importActual<any>('@/lib/env/stripe');
  return {
    ...actual,
    isPaymentsEnabled: () => false,
  };
});

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<any>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null,
  };
});

function logTestCleanupFailed(meta: Record<string, unknown>, error: unknown) {
  console.error('[test cleanup failed]', {
    file: 'checkout-no-payments.test.ts',
    ...meta,
    error,
  });
}

async function createIsolatedProductForCurrency(opts: {
  currency: 'USD' | 'UAH';
  stock: number;
}): Promise<{ productId: string }> {
  const now = new Date();

  const tpl = await getOrSeedActiveTemplateProduct();

  const productId = crypto.randomUUID();
  const slug = `t-iso-nopay-${crypto.randomUUID()}`;
  const sku = `t-iso-nopay-${crypto.randomUUID()}`;

  await db.insert(products).values({
    ...(tpl as any),
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    stock: opts.stock,
    isActive: false,
    createdAt: now,
    updatedAt: now,
  } as any);

  try {
    await db.insert(productPrices).values({
      productId,
      currency: opts.currency,
      priceMinor: 1000,
      price: toDbMoney(1000),
      originalPriceMinor: null,
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any);
  } catch (e) {
    try {
      await db.delete(products).where(eq(products.id, productId));
    } catch (cleanupError) {
      logTestCleanupFailed(
        {
          fn: 'createIsolatedProductForCurrency',
          step: 'rollback delete product after productPrices insert failure',
          productId,
          currency: opts.currency,
          stock: opts.stock,
        },
        cleanupError
      );
    }
    throw e;
  }

  return { productId };
}

async function cleanupIsolatedProduct(productId: string) {
  try {
    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(eq(products.id, productId));
  } catch (e) {
    logTestCleanupFailed(
      { fn: 'cleanupIsolatedProduct', step: 'deactivate product', productId },
      e
    );
  }

  try {
    await db
      .delete(productPrices)
      .where(eq(productPrices.productId, productId));
  } catch (e) {
    logTestCleanupFailed(
      {
        fn: 'cleanupIsolatedProduct',
        step: 'delete productPrices by productId',
        productId,
      },
      e
    );
  }

  try {
    await db.delete(products).where(eq(products.id, productId));
  } catch (e) {
    logTestCleanupFailed(
      { fn: 'cleanupIsolatedProduct', step: 'delete product by id', productId },
      e
    );
  }
}

async function postCheckout(params: {
  idemKey: string;
  acceptLanguage?: string;
  items: Array<{
    productId: string;
    quantity: number;
    selectedSize?: string;
    selectedColor?: string;
  }>;
  paymentProvider?: 'stripe' | 'monobank';
  paymentMethod?: string;
  paymentCurrency?: 'USD' | 'UAH';
}) {
  const mod = (await import('@/app/api/shop/checkout/route')) as unknown as {
    POST: (req: NextRequest) => Promise<Response>;
  };

  const req = new NextRequest('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': params.acceptLanguage ?? 'en',
      'idempotency-key': params.idemKey,
      'x-forwarded-for': deriveTestIpFromIdemKey(params.idemKey),
      origin: 'http://localhost:3000',
    },

    body: JSON.stringify({
      items: params.items,
      ...(params.paymentProvider
        ? { paymentProvider: params.paymentProvider }
        : {}),
      ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
      ...(params.paymentCurrency
        ? { paymentCurrency: params.paymentCurrency }
        : {}),
    }),
  });

  return mod.POST(req);
}

type MoveRow = { productId: string; type: string; quantity: number };

async function readMoves(orderId: string): Promise<MoveRow[]> {
  const res = (await db.execute(
    sql`
      select
        product_id as "productId",
        type,
        quantity
      from inventory_moves
      where order_id = ${orderId}::uuid
      order by created_at asc
    `
  )) as unknown as {
    rows?: Array<{ productId: unknown; type: unknown; quantity: unknown }>;
  };

  return (res.rows ?? []).map(row => ({
    productId: String(row.productId ?? ''),
    type: String(row.type ?? ''),
    quantity: Number(row.quantity ?? 0),
  }));
}
async function countMovesForProduct(productId: string): Promise<number> {
  const res = (await db.execute(
    sql`select count(*)::int as c from inventory_moves where product_id = ${productId}::uuid`
  )) as unknown as { rows?: Array<{ c: number | string }> };

  return Number(res.rows?.[0]?.c ?? 0);
}

async function bestEffortHardDeleteOrder(orderId: string) {
  try {
    await db.execute(
      sql`delete from inventory_moves where order_id = ${orderId}::uuid`
    );
  } catch (e) {
    logTestCleanupFailed(
      {
        fn: 'bestEffortHardDeleteOrder',
        step: 'delete inventory_moves by orderId',
        orderId,
      },
      e
    );
  }

  try {
    await db.execute(
      sql`delete from order_items where order_id = ${orderId}::uuid`
    );
  } catch (e) {
    logTestCleanupFailed(
      {
        fn: 'bestEffortHardDeleteOrder',
        step: 'delete order_items by orderId',
        orderId,
      },
      e
    );
  }

  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (e) {
    logTestCleanupFailed(
      { fn: 'bestEffortHardDeleteOrder', step: 'delete order by id', orderId },
      e
    );
  }
}

describe.sequential('Checkout provider fail-closed invariants', () => {
  it('Explicit Stripe request fails closed when Stripe is unavailable', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    try {
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      const [p0] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p0).toBeTruthy();
      const stockBefore = p0!.stock;
      const movesBefore = await countMovesForProduct(productId);

      const idemKey = crypto.randomUUID();
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        paymentProvider: 'stripe',
        items: [{ productId, quantity: 1 }],
      });

      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json?.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);
      expect(row).toBeFalsy();

      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);

      const movesAfter = await countMovesForProduct(productId);
      expect(movesAfter).toBe(movesBefore);
    } finally {
      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('omitted provider fails closed when no checkout provider is available', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    try {
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      const [p0] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p0).toBeTruthy();
      const stockBefore = p0!.stock;
      const movesBefore = await countMovesForProduct(productId);

      const idemKey = crypto.randomUUID();
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [{ productId, quantity: 1 }],
      });

      expect(res.status).toBe(503);

      const json: any = await res.json();
      expect(json?.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({
          id: orders.id,
          currency: orders.currency,
          paymentProvider: orders.paymentProvider,
          paymentStatus: orders.paymentStatus,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeFalsy();

      const movesAfter = await countMovesForProduct(productId);
      expect(movesAfter).toBe(movesBefore);

      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('repeated omitted-provider retries fail closed without creating orders or stock moves', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 3,
    });

    try {
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      const [p0] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p0).toBeTruthy();
      const stockBefore = p0!.stock;
      const movesBefore = await countMovesForProduct(productId);

      const idemKey = crypto.randomUUID();
      const body1 = [{ productId, quantity: 1 }];

      const r1 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: body1,
      });
      expect(r1.status).toBe(503);

      const j1: any = await r1.json();
      expect(j1?.code).toBe('PSP_UNAVAILABLE');

      const r2 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: body1,
      });
      expect(r2.status).toBe(503);

      const j2: any = await r2.json();
      expect(j2?.code).toBe('PSP_UNAVAILABLE');

      const r3 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [{ productId, quantity: 2 }],
      });
      expect(r3.status).toBe(503);

      const j3: any = await r3.json();
      expect(j3?.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);
      expect(row).toBeFalsy();

      const movesAfter = await countMovesForProduct(productId);
      expect(movesAfter).toBe(movesBefore);

      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);
  it('provider unavailability fails closed before variant processing', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    const idemKey = crypto.randomUUID();
    let unexpectedOrderId: string | null = null;

    try {
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      await db
        .update(products)
        .set({
          ...({
            sizes: ['S'],
            colors: ['Red'],
          } as any),
          updatedAt: new Date(),
        } as any)
        .where(eq(products.id, productId));

      const [p0] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p0).toBeTruthy();
      const stockBefore = p0!.stock;

      const countBefore = await countMovesForProduct(productId);

      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [
          {
            productId,
            quantity: 1,
            selectedSize: `INVALID_${crypto.randomUUID()}`,
            selectedColor: `INVALID_${crypto.randomUUID()}`,
          },
        ],
      });

      expect(res.status).toBe(503);

      const json: any = await res.json();

      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      expect(json?.code).toBe('PSP_UNAVAILABLE');
      const countAfter = await countMovesForProduct(productId);
      expect(countAfter).toBe(countBefore);

      const [maybeOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      if (maybeOrder?.id) unexpectedOrderId = maybeOrder.id;
      expect(maybeOrder).toBeFalsy();

      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      try {
        await db
          .update(products)
          .set({ isActive: false, updatedAt: new Date() } as any)
          .where(eq(products.id, productId));
      } catch {}

      if (unexpectedOrderId) {
        await bestEffortHardDeleteOrder(unexpectedOrderId);
      }

      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('provider unavailability fails closed before missing-variant checks', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    const idemKey = crypto.randomUUID();
    let unexpectedOrderId: string | null = null;

    try {
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      await db
        .update(products)
        .set({
          ...({
            sizes: [],
            colors: [],
          } as any),
          updatedAt: new Date(),
        } as any)
        .where(eq(products.id, productId));

      const [p0] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p0).toBeTruthy();
      const stockBefore = p0!.stock;

      const countBefore = await countMovesForProduct(productId);

      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [
          {
            productId,
            quantity: 1,

            selectedSize: 'S',
            selectedColor: 'Red',
          },
        ],
      });

      expect(res.status).toBe(503);

      const json: any = await res.json();

      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      expect(json?.code).toBe('PSP_UNAVAILABLE');

      const countAfter = await countMovesForProduct(productId);
      expect(countAfter).toBe(countBefore);

      const [maybeOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      if (maybeOrder?.id) unexpectedOrderId = maybeOrder.id;
      expect(maybeOrder).toBeFalsy();

      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      try {
        await db
          .update(products)
          .set({ isActive: false, updatedAt: new Date() } as any)
          .where(eq(products.id, productId));
      } catch {}

      if (unexpectedOrderId) {
        await bestEffortHardDeleteOrder(unexpectedOrderId);
      }

      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('Orphan cleanup path', async () => {
    const orphanId = crypto.randomUUID();
    const idemKey = crypto.randomUUID();
    const createdAt = new Date(Date.now() - 11 * 60_000);

    await db.insert(orders).values({
      id: orphanId,
      currency: 'USD',
      paymentProvider: 'none',
      paymentStatus: 'paid',
      paymentIntentId: null,
      status: 'CREATED',
      inventoryStatus: 'reserving',
      totalAmountMinor: 0,
      totalAmount: toDbMoney(0),
      idempotencyKey: idemKey,
      idempotencyRequestHash: 'orphan-test',
      userId: null,
      stockRestored: false,
      restockedAt: null,
      createdAt,
      updatedAt: createdAt,
      failureCode: null,
      failureMessage: null,
    } as any);

    const moves0 = await readMoves(orphanId);
    expect(moves0.length).toBe(0);

    const { restockStaleNoPaymentOrders } =
      await import('@/lib/services/orders');
    const processed = await restockStaleNoPaymentOrders({
      olderThanMinutes: 10,
      batchSize: 50,
    });

    expect(processed).toBeGreaterThan(0);

    const [row] = await db
      .select({
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        paymentStatus: orders.paymentStatus,
        failureCode: orders.failureCode,
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
      })
      .from(orders)
      .where(eq(orders.id, orphanId))
      .limit(1);

    expect(row).toBeTruthy();
    expect(row!.status).toBe('INVENTORY_FAILED');
    expect(row!.inventoryStatus).toBe('released');
    expect(row!.paymentStatus).toBe('failed');
    expect(row!.failureCode ?? '').toBe('STALE_ORPHAN');
    expect(row!.stockRestored).toBe(true);
    expect(row!.restockedAt).not.toBeNull();

    await bestEffortHardDeleteOrder(orphanId);
  }, 20_000);
});
