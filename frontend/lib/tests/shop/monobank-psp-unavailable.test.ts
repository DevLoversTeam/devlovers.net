import crypto from 'crypto';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { db } from '@/db';
import { orders, products, productPrices, paymentAttempts } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';
import { resetEnvCache } from '@/lib/env';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
    logInfo: () => {},
  };
});

vi.mock('@/lib/psp/monobank', () => ({
  MONO_CURRENCY: 'UAH',
  createMonobankInvoice: vi.fn(async () => {
    throw new Error('MONO_TIMEOUT');
  }),
  cancelMonobankInvoice: vi.fn(async () => {}),
}));

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevMonoToken = process.env.MONO_MERCHANT_TOKEN;
const __prevAppOrigin = process.env.APP_ORIGIN;
const __prevShopBaseUrl = process.env.SHOP_BASE_URL;
const __prevStatusSecret = process.env.SHOP_STATUS_TOKEN_SECRET;
const __prevDatabaseUrl = process.env.DATABASE_URL;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_MERCHANT_TOKEN = 'test_mono_token';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.SHOP_BASE_URL = 'http://localhost:3000';
  process.env.SHOP_STATUS_TOKEN_SECRET =
    'test_status_token_secret_test_status_token_secret';
  if (!process.env.DATABASE_URL && __prevDatabaseUrl) {
    process.env.DATABASE_URL = __prevDatabaseUrl;
  }
  resetEnvCache();
});

afterAll(() => {
  if (__prevRateLimitDisabled === undefined)
    delete process.env.RATE_LIMIT_DISABLED;
  else process.env.RATE_LIMIT_DISABLED = __prevRateLimitDisabled;

  if (__prevPaymentsEnabled === undefined) delete process.env.PAYMENTS_ENABLED;
  else process.env.PAYMENTS_ENABLED = __prevPaymentsEnabled;

  if (__prevMonoToken === undefined) delete process.env.MONO_MERCHANT_TOKEN;
  else process.env.MONO_MERCHANT_TOKEN = __prevMonoToken;

  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;
  if (__prevShopBaseUrl === undefined) delete process.env.SHOP_BASE_URL;
  else process.env.SHOP_BASE_URL = __prevShopBaseUrl;
  if (__prevStatusSecret === undefined)
    delete process.env.SHOP_STATUS_TOKEN_SECRET;
  else process.env.SHOP_STATUS_TOKEN_SECRET = __prevStatusSecret;

  if (__prevDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = __prevDatabaseUrl;
  resetEnvCache();
});

async function createIsolatedProduct(stock: number) {
  const [tpl] = await db
    .select()
    .from(products)
    .where(eq(products.isActive as any, true))
    .limit(1);

  if (!tpl) {
    throw new Error('No template product found to clone.');
  }

  const productId = crypto.randomUUID();
  const slug = `t-mono-${crypto.randomUUID()}`;
  const sku = `t-mono-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(products).values({
    ...(tpl as any),
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    stock,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.insert(productPrices).values({
    productId,
    currency: 'UAH',
    priceMinor: 1000,
    originalPriceMinor: null,
    price: toDbMoney(1000),
    originalPrice: null,
    createdAt: now,
    updatedAt: now,
  } as any);

  return { productId };
}

async function cleanupOrder(orderId: string) {
  await db.execute(
    sql`delete from inventory_moves where order_id = ${orderId}::uuid`
  );
  await db.execute(
    sql`delete from order_items where order_id = ${orderId}::uuid`
  );
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function cleanupProduct(productId: string) {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

async function postCheckout(idemKey: string, productId: string) {
  const mod = (await import('@/app/api/shop/checkout/route')) as unknown as {
    POST: (req: NextRequest) => Promise<Response>;
  };

  const req = new NextRequest('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': 'uk-UA',
      'idempotency-key': idemKey,
      'x-request-id': 'mono-req-1',
      'x-forwarded-for': deriveTestIpFromIdemKey(idemKey),
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      items: [{ productId, quantity: 1 }],
      paymentProvider: 'monobank',
    }),
  });

  return mod.POST(req);
}

describe.sequential('monobank PSP_UNAVAILABLE invariant', () => {
  it('cancel+restock on invoice/create failure', async () => {
    const { productId } = await createIsolatedProduct(2);
    const idemKey = crypto.randomUUID();
    let orderId: string | null = null;

    try {
      const res = await postCheckout(idemKey, productId);
      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({
          id: orders.id,
          currency: orders.currency,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
          failureCode: orders.failureCode,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeTruthy();
      orderId = row!.id;
      expect(row!.currency).toBe('UAH');
      expect(row!.status).toBe('CANCELED');
      expect(row!.failureCode).toBe('PSP_UNAVAILABLE');
      expect(row!.paymentStatus).toBe('failed');
      expect(row!.inventoryStatus).toBe('released');
      expect(row!.stockRestored).toBe(true);

      const moves = (await db.execute(
        sql`select type from inventory_moves where order_id = ${orderId}::uuid`
      )) as unknown as { rows?: Array<{ type: unknown }> };

      const moveTypes = (moves.rows ?? []).map(r => String(r.type ?? ''));
      expect(moveTypes).toContain('reserve');
      expect(moveTypes).toContain('release');

      const [attempt] = await db
        .select({
          status: paymentAttempts.status,
          lastErrorCode: paymentAttempts.lastErrorCode,
          metadata: paymentAttempts.metadata,
          currency: paymentAttempts.currency,
          expectedAmountMinor: paymentAttempts.expectedAmountMinor,
        })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);

      expect(attempt).toBeTruthy();
      expect(attempt!.status).toBe('failed');
      expect(attempt!.lastErrorCode).toBe('PSP_UNAVAILABLE');
      expect((attempt!.metadata as Record<string, unknown>)?.requestId).toBe(
        'mono-req-1'
      );
      expect(attempt!.currency).toBe('UAH');
      expect(attempt!.expectedAmountMinor).toBeGreaterThan(0);
    } finally {
      if (orderId) {
        await cleanupOrder(orderId);
      }
      await cleanupProduct(productId);
    }
  }, 20_000);
});
