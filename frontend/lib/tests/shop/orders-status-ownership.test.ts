import crypto from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
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
import { verifyStatusToken } from '@/lib/shop/status-token';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';
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
  const pageUrl = `https://pay.test/${invoiceId}`;
  return { invoiceId, pageUrl, raw: {} };
});

vi.mock('@/lib/psp/monobank', () => ({
  MONO_CURRENCY: 'UAH',
  createMonobankInvoice: (args: any) => createMonobankInvoiceMock(args),
  cancelMonobankInvoice: vi.fn(async () => {}),
}));

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevMonoToken = process.env.MONO_MERCHANT_TOKEN;
const __prevAppOrigin = process.env.APP_ORIGIN;
const __prevShopBaseUrl = process.env.SHOP_BASE_URL;
const __prevStatusSecret = process.env.SHOP_STATUS_TOKEN_SECRET;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.MONO_MERCHANT_TOKEN = 'test_mono_token';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.SHOP_BASE_URL = 'http://localhost:3000';
  process.env.SHOP_STATUS_TOKEN_SECRET =
    'test_status_token_secret_test_status_token_secret';

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

  resetEnvCache();
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function insertTestProductWithUAHPrice(args: {
  stock: number;
  priceMinor: number;
  currency: 'USD';
}) {
  const productId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const slug = `tst_status_owner_${token}`;
  const sku = `tst_status_owner_${token}`;
  const now = new Date();

  await db.insert(products).values({
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    description: 'Ownership test product',
    imageUrl: 'https://example.test/status-owner.png',
    imagePublicId: null,
    price: toDbMoney(args.priceMinor),
    originalPrice: null,
    currency: args.currency,
    category: null,
    type: null,
    colors: [],
    sizes: [],
    badge: 'NONE',
    isActive: true,
    isFeatured: false,
    stock: args.stock,
    createdAt: now,
    updatedAt: now,
  } as any);

  try {
    await db.insert(productPrices).values({
      productId,
      currency: 'UAH',
      priceMinor: args.priceMinor,
      originalPriceMinor: null,
      price: toDbMoney(args.priceMinor),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    } as any);
  } catch (e) {
    await db.delete(products).where(eq(products.id, productId));
    throw e;
  }

  return { productId };
}

async function cleanupProduct(productId: string) {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

async function cleanupOrder(orderId: string) {
  await db
    .execute(sql`delete from monobank_events where order_id = ${orderId}::uuid`)
    .catch(() => {});
  await db
    .execute(sql`delete from order_items where order_id = ${orderId}::uuid`)
    .catch(() => {});
  await db
    .delete(paymentAttempts)
    .where(eq(paymentAttempts.orderId, orderId))
    .catch(() => {});
  await db
    .delete(orders)
    .where(eq(orders.id, orderId))
    .catch(() => {});
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
      'x-request-id': `status-owner-${idemKey}`,
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

function extractStatusToken(
  json: any,
  orderId: string
): { token: string; paramName: string } {
  // 1) direct fields (existing + a few common alternates)
  const directCandidates: Array<[string, unknown]> = [
    ['statusToken', json?.statusToken],
    ['status_token', json?.status_token],
    ['token', json?.token],
    ['statusAccessToken', json?.statusAccessToken],
    ['status_access_token', json?.status_access_token],
  ];

  for (const [name, val] of directCandidates) {
    if (typeof val === 'string' && val.length > 0) {
      const v = verifyStatusToken({ token: val, orderId });
      if (v.ok) return { token: val, paramName: name };
    }
  }

  // 2) URL fields (existing + alternates)
  const urlFields = [
    'statusUrl',
    'status_url',
    'statusPageUrl',
    'status_page_url',
    'returnUrl',
    'return_url',
    'redirectUrl',
    'redirect_url',
  ] as const;

  for (const f of urlFields) {
    const urlStr = (json as any)?.[f];
    if (typeof urlStr === 'string' && urlStr.length > 0) {
      try {
        const u = new URL(urlStr);
        const params = ['statusToken', 'status_token', 'token', 't'];
        for (const p of params) {
          const v = u.searchParams.get(p);
          if (typeof v === 'string' && v.length > 0) {
            const ok = verifyStatusToken({ token: v, orderId });
            if (ok.ok) return { token: v, paramName: p };
          }
        }
      } catch {
        // ignore bad URL
      }
    }
  }

  const seen = new Set<any>();
  const stack: Array<{ v: any; path: string; depth: number }> = [
    { v: json, path: '$', depth: 0 },
  ];

  while (stack.length) {
    const cur = stack.pop()!;
    const { v, path, depth } = cur;

    if (v && typeof v === 'object') {
      if (seen.has(v)) continue;
      seen.add(v);

      if (depth > 4) continue;

      for (const [k, val] of Object.entries(v)) {
        const p = `${path}.${k}`;

        if (typeof val === 'string') {
          if (val.includes('.') && val.split('.').length === 2) {
            const ok = verifyStatusToken({ token: val, orderId });
            if (ok.ok) return { token: val, paramName: k };
          }

          if (val.startsWith('http://') || val.startsWith('https://')) {
            try {
              const u = new URL(val);
              for (const q of ['statusToken', 'status_token', 'token', 't']) {
                const cand = u.searchParams.get(q);
                if (cand) {
                  const ok = verifyStatusToken({ token: cand, orderId });
                  if (ok.ok) return { token: cand, paramName: q };
                }
              }
            } catch {
              // ignore
            }
          }
        } else if (val && typeof val === 'object') {
          stack.push({ v: val, path: p, depth: depth + 1 });
        }
      }
    }
  }

  const keys = json && typeof json === 'object' ? Object.keys(json) : [];
  throw new Error(
    `[ownership-test] status token not found in checkout response. ` +
      `top-level keys=${JSON.stringify(keys)} ` +
      `response=${JSON.stringify(json)}`
  );
}

async function getOrderStatus(
  orderId: string,
  paramName?: string,
  token?: string
) {
  const mod =
    (await import('@/app/api/shop/orders/[id]/status/route')) as unknown as {
      GET: (
        req: NextRequest,
        ctx: { params: { id: string } }
      ) => Promise<Response>;
    };

  const base = `http://localhost/api/shop/orders/${orderId}/status`;
  const url =
    paramName && token
      ? `${base}?${encodeURIComponent(paramName)}=${encodeURIComponent(token)}`
      : base;

  const req = new NextRequest(url, {
    method: 'GET',
    headers: {
      'accept-language': 'uk-UA',
      origin: 'http://localhost:3000',
      'x-request-id': `status-owner-get-${orderId}`,
    },
  });

  const res = await mod.GET(req, { params: { id: orderId } });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }
  return { res, json };
}

describe.sequential('orders/[id]/status ownership (J)', () => {
  assertNotProductionDb();

  it('no token -> 401/403; correct token -> 200; foreign token -> 403/404 (no IDOR)', async () => {
    const { productId } = await insertTestProductWithUAHPrice({
      stock: 5,
      priceMinor: 1000,
      currency: 'USD',
    });
    const createdOrderIds: string[] = [];

    try {
      const resA = await postCheckout(crypto.randomUUID(), productId);
      expect(resA.status).toBe(201);
      const jsonA: any = await resA.json();

      if (typeof jsonA?.orderId !== 'string') {
        throw new Error(
          `[ownership-test] checkout A did not return orderId:string`
        );
      }
      const orderA: string = jsonA.orderId;
      createdOrderIds.push(orderA);

      const tokA = extractStatusToken(jsonA, orderA);


      const resB = await postCheckout(crypto.randomUUID(), productId);
      expect(resB.status).toBe(201);
      const jsonB: any = await resB.json();

      if (typeof jsonB?.orderId !== 'string') {
        throw new Error(
          `[ownership-test] checkout B did not return orderId:string`
        );
      }
      const orderB: string = jsonB.orderId;
      createdOrderIds.push(orderB);

      const tokB = extractStatusToken(jsonB, orderB);

      {
        const { res } = await getOrderStatus(orderA);
        expect([401, 403]).toContain(res.status);
      }

      {
        const { res, json } = await getOrderStatus(
          orderA,
          tokA.paramName,
          tokA.token
        );
        expect(res.status).toBe(200);
        if (json && (json.orderId || json.id)) {
          expect(json.orderId ?? json.id).toBe(orderA);
        }
      }

      {
        const { res } = await getOrderStatus(
          orderA,
          tokA.paramName,
          tokB.token
        );
        expect([403, 404, 401]).toContain(res.status);
      }

      {
        const { res } = await getOrderStatus(
          orderA,
          tokA.paramName,
          `bad_${crypto.randomUUID()}`
        );
        expect([403, 404, 401]).toContain(res.status);
      }

      expect(createMonobankInvoiceMock).toHaveBeenCalledTimes(2);
    } finally {
      for (const id of createdOrderIds) {
        await cleanupOrder(id).catch(() => undefined);
      }
      await cleanupProduct(productId).catch(() => undefined);
    }
  }, 30_000);
});
