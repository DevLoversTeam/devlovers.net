// lib/tests/checkout-concurrency-stock1.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  products,
  productPrices,
  orders,
  orderItems,
  inventoryMoves,
} from '@/db/schema/shop';

// NOTE: checkout route will be imported dynamically after mocks are installed.

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<any>('@/lib/auth');
  return {
    ...actual,
    getCurrentUser: async () => null, // avoid cookies() in vitest
  };
});

type JsonValue = any;

function makeNextRequest(url: string, init: RequestInit): NextRequest {
  const req = new Request(url, init);
  return new NextRequest(req);
}

async function readJsonSafe(res: Response): Promise<JsonValue | null> {
  try {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function pick(obj: any, keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return undefined;
}

function normalizeMoveKind(v: unknown): string {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

describe('P0-8.10.1 checkout concurrency: stock=1, two parallel checkouts', () => {
  const stripeKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  ] as const;

  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of stripeKeys) originalEnv[k] = process.env[k];
    for (const k of stripeKeys) delete process.env[k];
  });

  afterAll(() => {
    for (const k of stripeKeys) {
      const v = originalEnv[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('must allow only one success and must not double-reserve (stock must not go below 0)', async () => {
    // ---------- Arrange: create isolated product + USD price, stock=1 ----------
    const productId = crypto.randomUUID();
    const slug = `__test_checkout_concurrency_${productId.slice(0, 8)}`;
    const now = new Date();
    await db.insert(products).values({
      id: productId,
      slug,
      title: `TEST concurrency stock=1 (${slug})`,
      imageUrl: '/placeholder.svg',

      // FIX: products.price is NOT NULL in DB (legacy column)
      price: 1000,
      originalPrice: null,
      currency: 'USD',

      stock: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as any);

    await db.insert(productPrices).values({
      id: crypto.randomUUID(),
      productId,
      currency: 'USD',

      // minor-units
      priceMinor: 1000,
      originalPriceMinor: null,

      // FIX: legacy major-unit columns are NOT NULL
      price: 10, // 1000 minor -> 10.00
      originalPrice: null,

      createdAt: now,
      updatedAt: now,
    } as any);

    // ---------- Helper: call checkout with given idempotency key ----------
    const baseUrl = 'http://localhost:3000';
    const { POST: checkoutPOST } = await import(
      '@/app/api/shop/checkout/route'
    );

    async function callCheckout(idemKey: string) {
      const body = JSON.stringify({
        items: [{ productId, quantity: 1 }],
      });

      const req = makeNextRequest(`${baseUrl}/api/shop/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Idempotency-Key': idemKey,
        },
        body,
      });

      const res = await checkoutPOST(req);
      const json = await readJsonSafe(res);

      return { status: res.status, json };
    }

    // ---------- Act: run two requests in parallel (start-gated) ----------
    const idemA = crypto.randomUUID();
    const idemB = crypto.randomUUID();

    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));

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

    // ---------- Assert: exactly one success, the other controlled failure ----------
    const results = [r1, r2];
    const success = results.filter(r => r.status === 201);
    const fail = results.filter(r => r.status !== 201);

    expect(success.length).toBe(1);
    expect(fail.length).toBe(1);

    expect(fail[0].status).toBeGreaterThanOrEqual(400);
    expect(fail[0].status).toBeLessThan(500);
    const failJson = fail[0].json || {};
    const failCode = String(
      pick(failJson, ['code', 'errorCode', 'businessCode', 'reason']) ?? ''
    ).toUpperCase();

    if (failCode) {
      expect(
        [
          'OUT_OF_STOCK',
          'INSUFFICIENT_STOCK',
          'STOCK',
          'NOT_ENOUGH_STOCK',
        ].some(k => failCode.includes(k))
      ).toBe(true);
    }

    // ---------- DB asserts: stock must be 0 ----------
    const prodRows = await db
      .select()
      .from(products)
      .where(eq((products as any).id, productId));

    expect(prodRows.length).toBe(1);

    const prod: any = prodRows[0];
    const stock =
      prod.stock ?? prod.stockQuantity ?? prod.stock_qty ?? prod.stock_quantity;

    expect(toNum(stock)).toBe(0);
    expect(toNum(stock)).toBeGreaterThanOrEqual(0);

    // ---------- Ledger asserts: no double reserve for this product ----------
    const moves = await db
      .select()
      .from(inventoryMoves)
      .where(eq((inventoryMoves as any).productId, productId));

    const reserveMoves = (moves as any[]).filter(m => {
      const kind = normalizeMoveKind(
        pick(m, ['kind', 'type', 'moveType', 'action', 'op'])
      );
      return kind === 'reserve' || kind === 'reserved';
    });

    const reservedUnits = reserveMoves.reduce((sum, m) => {
      const q = pick(m, [
        'quantity',
        'qty',
        'units',
        'delta',
        'deltaQty',
        'deltaQuantity',
      ]);
      return sum + Math.abs(toNum(q));
    }, 0);

    expect(reservedUnits).toBe(1);
    expect(reserveMoves.length).toBe(1);

    // ---------- Cleanup: best-effort ----------
    try {
      const oi = await db
        .select({ orderId: (orderItems as any).orderId })
        .from(orderItems)
        .where(eq((orderItems as any).productId, productId));

      const orderIds = oi.map((x: any) => x.orderId).filter(Boolean);

      await db
        .delete(orderItems)
        .where(eq((orderItems as any).productId, productId));
      await db
        .delete(inventoryMoves)
        .where(eq((inventoryMoves as any).productId, productId));
      await db
        .delete(productPrices)
        .where(eq((productPrices as any).productId, productId));

      if (orderIds.length) {
        await db.delete(orders).where(inArray((orders as any).id, orderIds));
      }

      await db.delete(products).where(eq((products as any).id, productId));
    } catch {
      // best-effort cleanup
    }
  }, 30000);
});
