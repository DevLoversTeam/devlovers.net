// frontend/lib/tests/checkout-no-payments.test.ts
import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/db";
import { orders, products } from "@/db/schema";
import { toDbMoney } from "@/lib/shop/money";

// Force "no payments" for this whole test file.
vi.mock("@/lib/env/stripe", async () => {
  const actual = await vi.importActual<any>("@/lib/env/stripe");
  return {
    ...actual,
    isPaymentsEnabled: () => false,
  };
});

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<any>("@/lib/auth");
  return {
    ...actual,
    getCurrentUser: async () => null, // critical: avoid cookies() in tests
  };
});

async function pickActiveProductIdsForCurrency(opts: {
  currency: "USD" | "UAH";
  count: number;
  minStock?: number;
}): Promise<string[]> {
  const { currency, count, minStock = 1 } = opts;

  // IMPORTANT: avoid "fresh" test fixtures from other files (e.g. t-missing-*)
  // and avoid newest-first ordering that can race with cleanup in parallel test files.
  const result: any = await db.execute(sql`
    select p.id
    from products p
    join product_prices pp on pp.product_id = p.id
    where p.is_active = true
      and p.stock >= ${minStock}
      and pp.currency = ${currency}
      and pp.price_minor is not null
      and p.slug not like 't-missing-%'
    order by p.created_at asc
    limit ${count}
  `);

  const rows = result?.rows ?? result;
  const ids = (rows ?? []).map((r: any) => r.id).filter(Boolean);

  if (ids.length < count) {
    throw new Error(
      `Not enough stable active products for currency=${currency}. Need=${count}, got=${ids.length}. ` +
        `Ensure DB has active products with product_prices.${currency} and stock>=${minStock}.`
    );
  }

  return ids.slice(0, count);
}

async function postCheckout(params: {
  idemKey: string;
  acceptLanguage?: string;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const { POST } = await import("@/app/api/shop/checkout/route");

  const req = new NextRequest("http://localhost/api/shop/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept-language": params.acceptLanguage ?? "en",
      "idempotency-key": params.idemKey,
    },
    body: JSON.stringify({ items: params.items }),
  });

  return POST(req);
}

type MoveRow = { productId: string; type: string; quantity: number };

async function readMoves(orderId: string): Promise<MoveRow[]> {
  const res = await db.execute(
    sql`
      select
        product_id as "productId",
        type,
        quantity
      from inventory_moves
      where order_id = ${orderId}::uuid
      order by created_at asc
    `
  );

  return (res.rows ?? []) as unknown as MoveRow[];
}

async function bestEffortHardDeleteOrder(orderId: string) {
  // Keep DB reasonably clean in dev.
  // Use raw SQL because inventory_moves/order_items may not be exported as Drizzle tables.
  try {
    await db.execute(sql`delete from inventory_moves where order_id = ${orderId}::uuid`);
  } catch {}
  try {
    await db.execute(sql`delete from order_items where order_id = ${orderId}::uuid`);
  } catch {}
  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch {}
}

describe.sequential("Checkout (no payments) invariants", () => {
  it("No-payments success path", async () => {
    const [productId] = await pickActiveProductIdsForCurrency({
      currency: "USD",
      count: 1,
      minStock: 1,
    });

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
      acceptLanguage: "en",
      items: [{ productId, quantity: 1 }],
    });

    expect([200, 201]).toContain(res.status);

    const json: any = await res.json();
    expect(json?.success).toBe(true);

    const orderId: string = json?.order?.id ?? json?.orderId;
    expect(typeof orderId).toBe("string");
    expect(orderId.length).toBeGreaterThan(10);

    // response-level contract
    expect(json.order.paymentProvider).toBe("none");
    expect(json.order.paymentStatus).toBe("paid");
    expect(json.order.currency).toBe("USD");

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
    expect(row!.paymentProvider).toBe("none");
    expect(row!.paymentStatus).toBe("paid"); // forced by DB CHECK for provider=none
    expect(row!.inventoryStatus).toBe("reserved"); // TRUE finality for no-payments
    expect(row!.status).toBe("PAID");
    expect(row!.currency).toBe("USD");
    expect(row!.totalAmountMinor).toBeGreaterThan(0);

    // Ledger: exactly one reserve (no duplicates on single request)
    const moves = await readMoves(orderId);
    const reserves = moves.filter((m) => m.type === "reserve");
    const releases = moves.filter((m) => m.type === "release");

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
    const { restockOrder } = await import("@/lib/services/orders");
    await restockOrder(orderId, { reason: "stale" });

    const [p2] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(p2).toBeTruthy();
    expect(p2!.stock).toBe(stockBefore);

    await bestEffortHardDeleteOrder(orderId);
  }, 20_000);

  it("Idempotency for no-payments", async () => {
    const [productId] = await pickActiveProductIdsForCurrency({
      currency: "USD",
      count: 1,
      minStock: 1,
    });

    const [p0] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(p0).toBeTruthy();
    const stockBefore = p0!.stock;

    const idemKey = crypto.randomUUID();
    const body1 = [{ productId, quantity: 1 }];

    const r1 = await postCheckout({ idemKey, acceptLanguage: "en", items: body1 });
    expect([200, 201]).toContain(r1.status);

    const j1: any = await r1.json();
    const orderId1: string = j1?.order?.id ?? j1?.orderId;
    expect(orderId1).toBeTruthy();

    // same IdemKey + same payload => same order id (no extra reserve)
    const r2 = await postCheckout({ idemKey, acceptLanguage: "en", items: body1 });
    expect([200, 201]).toContain(r2.status);

    const j2: any = await r2.json();
    const orderId2: string = j2?.order?.id ?? j2?.orderId;

    expect(orderId2).toBe(orderId1);

    const movesAfter2 = await readMoves(orderId1);
    const reservesAfter2 = movesAfter2.filter((m) => m.type === "reserve");
    expect(reservesAfter2.length).toBe(1); // critical: no double-reserve

    // same IdemKey but different payload => 409 conflict
    const r3 = await postCheckout({
      idemKey,
      acceptLanguage: "en",
      items: [{ productId, quantity: 2 }],
    });
    expect(r3.status).toBe(409);

    // cleanup: restore stock via release
    const { restockOrder } = await import("@/lib/services/orders");
    await restockOrder(orderId1, { reason: "stale" });

    const [p2] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    expect(p2).toBeTruthy();
    expect(p2!.stock).toBe(stockBefore);

    await bestEffortHardDeleteOrder(orderId1);
  }, 20_000);

  it("Orphan cleanup path", async () => {
    const orphanId = crypto.randomUUID();
    const idemKey = crypto.randomUUID();
    const createdAt = new Date(Date.now() - 60_000);

    // Insert orphan order (no inventory_moves)
    await db.insert(orders).values({
      id: orphanId,
      currency: "USD",
      paymentProvider: "none",
      paymentStatus: "paid",
      paymentIntentId: null,

      status: "CREATED",
      inventoryStatus: "none",

      totalAmountMinor: 0,
      totalAmount: toDbMoney(0),

      idempotencyKey: idemKey,
      idempotencyRequestHash: "orphan-test",
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

    const { restockStaleNoPaymentOrders } = await import("@/lib/services/orders");
    const processed = await restockStaleNoPaymentOrders({
      olderThanMinutes: 0,
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
    expect(row!.status).toBe("INVENTORY_FAILED");
    expect(row!.inventoryStatus).toBe("released");
    expect(row!.paymentStatus).toBe("failed");
    expect(row!.failureCode ?? "").toBe("STALE_ORPHAN");
    expect(row!.stockRestored).toBe(true);
    expect(row!.restockedAt).not.toBeNull();

    await bestEffortHardDeleteOrder(orphanId);
  });
});
