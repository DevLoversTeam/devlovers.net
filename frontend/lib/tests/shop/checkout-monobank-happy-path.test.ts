import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
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
  return {
    invoiceId,
    pageUrl,
    raw: {},
  };
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

async function insertTestProductWithPrice(args: {
  stock: number;
  priceMinor: number;
  currency: 'USD';
}) {
  const productId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const slug = `tst_mono_happy_${token}`;
  const sku = `tst_mono_happy_${token}`;
  const now = new Date();

  await db.insert(products).values({
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    description: 'Hermetic checkout product',
    imageUrl: 'https://example.test/monobank-happy-path.png',
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
  } catch (error) {
    await db.delete(products).where(eq(products.id, productId));
    throw error;
  }

  return { productId };
}

async function cleanupOrder(orderId: string) {
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
      'x-request-id': `mono-happy-${idemKey}`,
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

describe.sequential('checkout monobank happy path', () => {
  assertNotProductionDb();

  it('creates order+attempt and returns pageUrl with Monobank provider contract', async () => {
    const { productId } = await insertTestProductWithPrice({
      stock: 3,
      priceMinor: 1000,
      currency: 'USD',
    });
    const idemKey = crypto.randomUUID();
    let orderId: string | undefined;

    try {
      const res = await postCheckout(idemKey, productId);
      expect(res.status).toBe(201);

      const json: any = await res.json();

      if (typeof json.orderId !== 'string')
        throw new Error('orderId must be string');
      const orderIdStr: string = json.orderId;
      orderId = orderIdStr;

      if (typeof json.attemptId !== 'string')
        throw new Error('attemptId must be string');
      const attemptIdStr: string = json.attemptId;

      expect(json.success).toBe(true);
      expect(json.provider).toBe('mono');
      expect(json.currency).toBe('UAH');
      expect(typeof json.totalAmountMinor).toBe('number');
      expect(json.totalAmountMinor).toBe(1000);
      expect(typeof json.pageUrl).toBe('string');
      expect(json.pageUrl).toMatch(/^https:\/\/pay\.test\/inv_/);

      const [dbOrder] = await db
        .select({
          id: orders.id,
          currency: orders.currency,
          totalAmountMinor: orders.totalAmountMinor,
          paymentProvider: orders.paymentProvider,
          paymentStatus: orders.paymentStatus,
          pspChargeId: orders.pspChargeId,
        })
        .from(orders)
        .where(eq(orders.id, orderIdStr))
        .limit(1);

      expect(dbOrder).toBeTruthy();
      expect(dbOrder?.currency).toBe('UAH');
      expect(dbOrder?.totalAmountMinor).toBe(1000);
      expect(dbOrder?.paymentProvider).toBe('monobank');
      expect(dbOrder?.paymentStatus).toBe('pending');
      expect(typeof dbOrder?.pspChargeId).toBe('string');

      const [attempt] = await db
        .select({
          id: paymentAttempts.id,
          provider: paymentAttempts.provider,
          currency: paymentAttempts.currency,
          expectedAmountMinor: paymentAttempts.expectedAmountMinor,
          providerPaymentIntentId: paymentAttempts.providerPaymentIntentId,
          checkoutUrl: paymentAttempts.checkoutUrl,
          metadata: paymentAttempts.metadata,
        })
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.orderId, orderIdStr),
            eq(paymentAttempts.provider, 'monobank')
          )
        )
        .limit(1);

      expect(attempt).toBeTruthy();
      expect(attempt?.id).toBe(attemptIdStr);
      expect(attempt?.provider).toBe('monobank');
      expect(attempt?.currency).toBe('UAH');
      expect(attempt?.expectedAmountMinor).toBe(1000);
      expect(typeof attempt?.providerPaymentIntentId).toBe('string');
      expect(attempt?.providerPaymentIntentId).toBe(dbOrder?.pspChargeId);

      const attemptMeta = (attempt?.metadata ?? {}) as Record<string, unknown>;
      const persistedPageUrl =
        attempt?.checkoutUrl ??
        (typeof attemptMeta.pageUrl === 'string' ? attemptMeta.pageUrl : null);

      expect(persistedPageUrl).toBe(json.pageUrl);
      expect(attemptMeta.invoiceId).toBe(attempt?.providerPaymentIntentId);

      expect(createMonobankInvoiceMock).toHaveBeenCalledTimes(1);
    } finally {
      if (orderId) {
        await cleanupOrder(orderId).catch(() => undefined);
      }
      await cleanupProduct(productId).catch(() => undefined);
    }
  }, 20_000);
});
