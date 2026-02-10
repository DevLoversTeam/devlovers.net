import crypto from 'crypto';
import { and, eq, sql } from 'drizzle-orm';
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
import { orders, paymentAttempts, productPrices, products } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { toDbMoney } from '@/lib/shop/money';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';

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

const createMonobankInvoiceMock = vi.fn(async (args: any) => {
  const orderId =
    typeof args?.orderId === 'string' ? args.orderId : crypto.randomUUID();

  const invoiceId = `inv_${orderId}`;
  return {
    invoiceId,
    pageUrl: `https://pay.test/${invoiceId}`,
    raw: {},
  };
});

vi.mock('@/lib/psp/monobank', () => ({
  MONO_CURRENCY: 'UAH',
  createMonobankInvoice: (args: any) => createMonobankInvoiceMock(args),
  cancelMonobankInvoice: vi.fn(async () => {}),
}));

let __seedTemplateProductId: string | null = null;

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
  if (__prevDatabaseUrl !== undefined) {
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

beforeEach(() => {
  vi.clearAllMocks();
});

function readRows<T = any>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (Array.isArray(res?.rows)) return res.rows as T[];
  return [];
}

type ColumnInfo = {
  column_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  data_type: string;
  udt_name: string;
  is_identity?: 'YES' | 'NO';
  is_generated?: 'ALWAYS' | 'NEVER';
};

function qIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function getFirstEnumLabel(typeName: string): Promise<string> {
  const res = await db.execute(sql`
    select e.enumlabel as label
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = ${typeName}
    order by e.enumsortorder asc
    limit 1
  `);
  const rows = readRows<{ label?: unknown }>(res);
  const label = rows[0]?.label;
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(`Unable to resolve enum label for type "${typeName}".`);
  }
  return label;
}

async function seedTemplateProductIfMissing(): Promise<any> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.isActive as any, true))
    .limit(1);

  if (existing) return existing;

  const productId = crypto.randomUUID();
  const slug = `t-seed-${crypto.randomUUID()}`;
  const sku = `t-seed-${crypto.randomUUID()}`;
  const now = new Date();

  __seedTemplateProductId = productId;

  const infoRes = await db.execute(sql`
    select
      column_name,
      is_nullable,
      column_default,
      data_type,
      udt_name,
      is_identity,
      is_generated
    from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
    order by ordinal_position asc
  `);
  const cols = readRows<ColumnInfo>(infoRes);
  if (!cols.length) throw new Error('Unable to introspect products columns.');

  const preferred: Record<string, unknown> = {
    id: productId,
    slug,
    sku,
    title: `Seed ${slug}`,
    stock: 9999,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const insertCols: string[] = [];
  const insertVals: any[] = [];

  for (const c of cols) {
    const col = c.column_name;
    const hasPreferred = Object.prototype.hasOwnProperty.call(preferred, col);
    const isGenerated = c.is_generated === 'ALWAYS';
    const isIdentity = c.is_identity === 'YES';
    const requiredNoDefault =
      c.is_nullable === 'NO' &&
      (c.column_default === null || c.column_default === undefined);

    if (isGenerated || isIdentity) continue;
    if (!hasPreferred && !requiredNoDefault) continue;

    insertCols.push(col);

    if (hasPreferred) {
      insertVals.push(sql`${preferred[col]}`);
      continue;
    }

    if (c.data_type === 'USER-DEFINED') {
      const enumLabel = await getFirstEnumLabel(c.udt_name);
      insertVals.push(sql`${enumLabel}::${sql.raw(qIdent(c.udt_name))}`);
      continue;
    }

    switch (c.data_type) {
      case 'boolean':
        insertVals.push(sql`false`);
        break;
      case 'smallint':
      case 'integer':
      case 'bigint':
      case 'numeric':
      case 'real':
      case 'double precision':
        insertVals.push(sql`0`);
        break;
      case 'uuid':
        insertVals.push(sql`${crypto.randomUUID()}::uuid`);
        break;
      case 'jsonb':
        insertVals.push(sql`${JSON.stringify({})}::jsonb`);
        break;
      case 'json':
        insertVals.push(sql`${JSON.stringify({})}::json`);
        break;
      case 'date':
        insertVals.push(sql`${now.toISOString().slice(0, 10)}`);
        break;
      case 'timestamp with time zone':
      case 'timestamp without time zone':
      case 'timestamp':
        insertVals.push(sql`${now}`);
        break;
      default:
        insertVals.push(sql`${`seed_${col}_${crypto.randomUUID()}`}`);
        break;
    }
  }

  const colSql = insertCols.map(c => sql.raw(qIdent(c)));
  await db.execute(sql`
    insert into "products" (${sql.join(colSql, sql`, `)})
    values (${sql.join(insertVals, sql`, `)})
  `);

  await db.insert(productPrices).values([
    {
      productId,
      currency: 'UAH',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any,
    {
      productId,
      currency: 'USD',
      priceMinor: 1000,
      originalPriceMinor: null,
      price: toDbMoney(1000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any,
  ]);

  const [seeded] = await db
    .select()
    .from(products)
    .where(eq(products.id as any, productId))
    .limit(1);
  if (!seeded) throw new Error('Failed to seed template product.');

  return seeded;
}

async function createIsolatedProduct(args: {
  stock: number;
  prices: Array<{ currency: 'USD' | 'UAH'; priceMinor: number }>;
}) {
  const tpl = await seedTemplateProductIfMissing();

  const productId = crypto.randomUUID();
  const slug = `t-mono-contract-${crypto.randomUUID()}`;
  const sku = `t-mono-contract-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(products).values({
    ...(tpl as any),
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    stock: args.stock,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.insert(productPrices).values(
    args.prices.map(price => ({
      productId,
      currency: price.currency,
      priceMinor: price.priceMinor,
      originalPriceMinor: null,
      price: toDbMoney(price.priceMinor),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    })) as any
  );

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
  await db.execute(
    sql`delete from inventory_moves where product_id = ${productId}::uuid`
  );
  await db.execute(
    sql`delete from order_items where product_id = ${productId}::uuid`
  );
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

function warnCleanup(step: string, err: unknown) {
  console.warn('[checkout-monobank-idempotency-contract.test] cleanup failed', {
    step,
    err: err instanceof Error ? { name: err.name, message: err.message } : err,
  });
}

afterAll(async () => {
  if (!__seedTemplateProductId) return;
  try {
    await cleanupProduct(__seedTemplateProductId);
  } catch (e) { warnCleanup('cleanupSeedTemplateProduct', e); }
  __seedTemplateProductId = null;
});

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
      'x-request-id': `mono-test-${idemKey}`,
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

describe.sequential('checkout monobank contract', () => {
  it('idempotency: same key+payload returns same order/page/attempt and does not duplicate invoice', async () => {
    const { productId } = await createIsolatedProduct({
      stock: 3,
      prices: [{ currency: 'UAH', priceMinor: 1000 }],
    });
    const idemKey = crypto.randomUUID();
    let orderId: string | null = null;

    try {
      const res1 = await postCheckout(idemKey, productId);
      if (res1.status !== 201) {
        const bodyText = await res1
          .clone()
          .text()
          .catch(() => '<no-body>');

        const [dbOrder] = await db
          .select({
            id: orders.id,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            inventoryStatus: orders.inventoryStatus,
            failureCode: orders.failureCode,
            failureMessage: orders.failureMessage,
            currency: orders.currency,
            totalAmountMinor: orders.totalAmountMinor,
            pspChargeId: orders.pspChargeId,
            pspMetadata: orders.pspMetadata,
          })
          .from(orders)
          .where(eq(orders.idempotencyKey, idemKey))
          .limit(1);

        const attempts = dbOrder?.id
          ? await db
              .select({
                id: paymentAttempts.id,
                status: paymentAttempts.status,
                attemptNumber: paymentAttempts.attemptNumber,
                providerPaymentIntentId:
                  paymentAttempts.providerPaymentIntentId,
                lastErrorCode: paymentAttempts.lastErrorCode,
                lastErrorMessage: paymentAttempts.lastErrorMessage,
                metadata: paymentAttempts.metadata,
                expectedAmountMinor: paymentAttempts.expectedAmountMinor,
                currency: paymentAttempts.currency,
                createdAt: paymentAttempts.createdAt,
                updatedAt: paymentAttempts.updatedAt,
                finalizedAt: paymentAttempts.finalizedAt,
              })
              .from(paymentAttempts)
              .where(eq(paymentAttempts.orderId, dbOrder.id))
          : [];

        throw new Error(
          `checkout failed: status=${res1.status}\n` +
            `body=${bodyText}\n` +
            `order=${JSON.stringify(dbOrder ?? null, null, 2)}\n` +
            `attempts=${JSON.stringify(attempts ?? [], null, 2)}\n`
        );
      }

      const res2 = await postCheckout(idemKey, productId);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(200);

      const json1: any = await res1.json();
      orderId = json1.orderId;

      const json2: any = await res2.json();

      expect(json1.success).toBe(true);
      expect(json2.success).toBe(true);
      expect(typeof json1.orderId).toBe('string');
      expect(typeof json1.attemptId).toBe('string');
      expect(typeof json1.pageUrl).toBe('string');
      expect(typeof json1.totalAmountMinor).toBe('number');
      expect(json1.orderId).toBeTruthy();
      expect(json1.orderId).toBe(json2.orderId);
      expect(json1.attemptId).toBeTruthy();
      expect(json1.attemptId).toBe(json2.attemptId);
      expect(json1.pageUrl).toBeTruthy();
      expect(json1.pageUrl).toBe(json2.pageUrl);
      expect(json1.provider).toBe('mono');
      expect(json2.provider).toBe('mono');
      expect(json1.currency).toBe('UAH');
      expect(json2.currency).toBe('UAH');
      expect(json1.totalAmountMinor).toBeGreaterThan(0);
      expect(json1.totalAmountMinor).toBe(json2.totalAmountMinor);

      const [dbOrder] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);
      expect(dbOrder?.id).toBe(orderId);

      const attemptRows = await db
        .select({ id: paymentAttempts.id })
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.orderId, orderId as string),
            eq(paymentAttempts.provider, 'monobank')
          )
        );
      expect(attemptRows.length).toBe(1);

      expect(createMonobankInvoiceMock).toHaveBeenCalledTimes(1);
    } finally {
      if (orderId) await cleanupOrder(orderId).catch(() => {});
      await cleanupProduct(productId).catch(() => {});
    }
  }, 20_000);

  it('missing UAH price -> 422 PRICE_CONFIG_ERROR for monobank checkout', async () => {
    const { productId } = await createIsolatedProduct({
      stock: 2,
      prices: [{ currency: 'USD', priceMinor: 1000 }],
    });
    const idemKey = crypto.randomUUID();

    try {
      const res = await postCheckout(idemKey, productId);
      expect(res.status).toBe(422);
      const json: any = await res.json();
      expect(json.code).toBe('PRICE_CONFIG_ERROR');
      expect(createMonobankInvoiceMock).not.toHaveBeenCalled();
    } finally {
      await cleanupProduct(productId).catch(() => {});
    }
  }, 20_000);
});
