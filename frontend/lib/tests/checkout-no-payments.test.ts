// frontend/lib/tests/checkout-no-payments.test.ts
import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';
import { db } from '@/db';
import { orders, products, productPrices } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {}, // silence expected business warnings in this test file
  };
});

// Force "no payments" for this whole test file.
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
    getCurrentUser: async () => null, // critical: avoid cookies() in tests
  };
});

function logTestCleanupFailed(meta: Record<string, unknown>, error: unknown) {
  console.error('[test cleanup failed]', {
    file: 'checkout-no-payments.test.ts',
    ...meta,
    error,
  });
}

/**
 * Creates an isolated product + product_prices row to avoid stock races
 * with parallel test files that also reserve/release inventory.
 *
 * Product is created as inactive by default; tests activate it only for the minimal window needed.
 */
async function createIsolatedProductForCurrency(opts: {
  currency: 'USD' | 'UAH';
  stock: number;
}): Promise<{ productId: string }> {
  const now = new Date();

  // Clone a real product row to satisfy NOT NULL columns (schema varies).
  const [tpl] = await db
    .select()
    .from(products)
    .where(eq(products.isActive as any, true))
    .limit(1);

  if (!tpl) {
    throw new Error(
      'No template product found to clone (need at least 1 active product).'
    );
  }

  const productId = crypto.randomUUID();
  const slug = `t-iso-nopay-${crypto.randomUUID()}`;
  const sku = `t-iso-nopay-${crypto.randomUUID()}`;

  // Keep inactive by default to avoid being picked by other tests.
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

  // Ensure price exists for requested currency (minor + legacy).
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
    // Cleanup orphaned product on price insert failure (best-effort)
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
  // Make sure it won't be visible for any selector.
  try {
    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() } as any)
      .where(eq(products.id, productId));
  } catch (e) {
    // Non-fatal: best-effort test teardown
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
    },

    body: JSON.stringify({ items: params.items }),
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
  // Keep DB reasonably clean in dev.
  // Use raw SQL because inventory_moves/order_items may not be exported as Drizzle tables.
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

describe.sequential('Checkout (no payments) invariants', () => {
  it('No-payments success path', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    let orderId: string | null = null;

    try {
      // Activate only for the minimal window needed by checkout.
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

      const idemKey = crypto.randomUUID();
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [{ productId, quantity: 1 }],
      });

      expect([200, 201]).toContain(res.status);

      const json: any = await res.json();
      expect(json?.success).toBe(true);

      orderId = (json?.order?.id ?? json?.orderId) as string;
      expect(typeof orderId).toBe('string');
      expect(orderId.length).toBeGreaterThan(10);

      // Deactivate immediately to minimize chance other parallel tests pick it.
      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      // response-level contract
      expect(json.order.paymentProvider).toBe('none');
      expect(json.order.paymentStatus).toBe('paid');
      expect(json.order.currency).toBe('USD');

      // DB contract (source of truth)
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
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row).toBeTruthy();
      expect(row!.paymentProvider).toBe('none');
      expect(row!.paymentStatus).toBe('paid'); // forced by DB CHECK for provider=none
      expect(row!.inventoryStatus).toBe('reserved'); // TRUE finality for no-payments
      expect(row!.status).toBe('PAID');
      expect(row!.currency).toBe('USD');
      expect(row!.totalAmountMinor).toBeGreaterThan(0);

      // Ledger: exactly one reserve (no duplicates on single request)
      const moves = await readMoves(orderId);
      const reserves = moves.filter(m => m.type === 'reserve');
      const releases = moves.filter(m => m.type === 'release');

      expect(reserves.length).toBe(1);
      expect(reserves[0]!.productId).toBe(productId);
      expect(reserves[0]!.quantity).toBe(1);
      expect(releases.length).toBe(0);

      // Stock decreased
      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore - 1);

      // cleanup: restore stock via release
      const { restockOrder } = await import('@/lib/services/orders');
      await restockOrder(orderId, { reason: 'stale' });

      const [p2] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p2).toBeTruthy();
      expect(p2!.stock).toBe(stockBefore);

      await bestEffortHardDeleteOrder(orderId);
      orderId = null;
    } finally {
      // If test failed after creating an order, try to delete it.
      if (orderId) {
        await bestEffortHardDeleteOrder(orderId);
      }
      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('Idempotency for no-payments', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 3,
    });

    let orderId1: string | null = null;

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

      const idemKey = crypto.randomUUID();
      const body1 = [{ productId, quantity: 1 }];

      const r1 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: body1,
      });
      expect([200, 201]).toContain(r1.status);

      const j1: any = await r1.json();
      orderId1 = (j1?.order?.id ?? j1?.orderId) as string;
      expect(orderId1).toBeTruthy();

      // Deactivate immediately (same reason as in success-path test)
      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      // same IdemKey + same payload => same order id (no extra reserve)
      const r2 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: body1,
      });
      expect([200, 201]).toContain(r2.status);

      const j2: any = await r2.json();
      const orderId2: string = (j2?.order?.id ?? j2?.orderId) as string;

      expect(orderId2).toBe(orderId1);

      const movesAfter2 = await readMoves(orderId1);
      const reservesAfter2 = movesAfter2.filter(m => m.type === 'reserve');
      expect(reservesAfter2.length).toBe(1); // critical: no double-reserve

      // same IdemKey but different payload => 409 conflict
      const r3 = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [{ productId, quantity: 2 }],
      });
      expect(r3.status).toBe(409);

      // cleanup: restore stock via release
      const { restockOrder } = await import('@/lib/services/orders');
      await restockOrder(orderId1, { reason: 'stale' });

      const [p2] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p2).toBeTruthy();
      expect(p2!.stock).toBe(stockBefore);

      await bestEffortHardDeleteOrder(orderId1);
      orderId1 = null;
    } finally {
      if (orderId1) {
        await bestEffortHardDeleteOrder(orderId1);
      }
      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);
  it('Invalid variant rejects without side effects (no payments)', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    const idemKey = crypto.randomUUID();
    let unexpectedOrderId: string | null = null;

    try {
      // Activate only for the minimal window needed by checkout.
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      // Make variants deterministic for this test.
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
      // ДО checkout: порахували moves
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

      expect(res.status).toBe(400);

      const json: any = await res.json();
      // Deactivate immediately to minimize chance other parallel tests pick it.
      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      expect(json?.code).toBe('INVALID_VARIANT');
      const countAfter = await countMovesForProduct(productId);
      expect(countAfter).toBe(countBefore);

      // No order should be created for invalid variant
      const [maybeOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      if (maybeOrder?.id) unexpectedOrderId = maybeOrder.id;
      expect(maybeOrder).toBeFalsy();

      // Stock must not change
      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      // Deactivate to reduce cross-test interference.
      try {
        await db
          .update(products)
          .set({ isActive: false, updatedAt: new Date() } as any)
          .where(eq(products.id, productId));
      } catch {}

      // If an order was unexpectedly created, remove it (keep DB clean).
      if (unexpectedOrderId) {
        await bestEffortHardDeleteOrder(unexpectedOrderId);
      }

      await cleanupIsolatedProduct(productId);
    }
  }, 20_000);

  it('Missing variants reject when client provides options (no payments)', async () => {
    const { productId } = await createIsolatedProductForCurrency({
      currency: 'USD',
      stock: 2,
    });

    const idemKey = crypto.randomUUID();
    let unexpectedOrderId: string | null = null;

    try {
      // Activate only for the minimal window needed by checkout.
      await db
        .update(products)
        .set({ isActive: true, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      // Simulate "no variants configured" (empty lists).
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

      // ДО checkout: порахували moves
      const countBefore = await countMovesForProduct(productId);

      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en',
        items: [
          {
            productId,
            quantity: 1,
            // Client sends options, but product has none => must be rejected.
            selectedSize: 'S',
            selectedColor: 'Red',
          },
        ],
      });

      expect(res.status).toBe(400);

      const json: any = await res.json();

      // Deactivate immediately to minimize chance other parallel tests pick it.
      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(eq(products.id, productId));

      expect(json?.code).toBe('INVALID_VARIANT');

      // Після checkout: moves count must be unchanged
      const countAfter = await countMovesForProduct(productId);
      expect(countAfter).toBe(countBefore);

      // No order should be created for this idemKey
      const [maybeOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      if (maybeOrder?.id) unexpectedOrderId = maybeOrder.id;
      expect(maybeOrder).toBeFalsy();

      // Stock must not change
      const [p1] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      expect(p1).toBeTruthy();
      expect(p1!.stock).toBe(stockBefore);
    } finally {
      // Deactivate to reduce cross-test interference.
      try {
        await db
          .update(products)
          .set({ isActive: false, updatedAt: new Date() } as any)
          .where(eq(products.id, productId));
      } catch {}

      // If an order was unexpectedly created, remove it (keep DB clean).
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

    // Insert orphan order (no inventory_moves)
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

    const { restockStaleNoPaymentOrders } = await import(
      '@/lib/services/orders'
    );
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
