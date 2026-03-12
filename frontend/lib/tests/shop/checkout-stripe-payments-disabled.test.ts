import crypto from 'crypto';
import { eq } from 'drizzle-orm';
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
  paymentAttempts,
  productPrices,
  products,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { toDbMoney } from '@/lib/shop/money';
import { deriveTestIpFromIdemKey } from '@/lib/tests/helpers/ip';
import { getOrSeedActiveTemplateProduct } from '@/lib/tests/helpers/seed-product';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/services/orders/payment-attempts', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/orders/payment-attempts'
  );
  return {
    ...actual,
    ensureStripePaymentIntentForOrder: vi.fn(
      async (args: { orderId: string }) => {
        return {
          paymentIntentId: `pi_test_${args.orderId.slice(0, 8)}`,
          clientSecret: `cs_test_${args.orderId.slice(0, 8)}`,
          attemptId: crypto.randomUUID(),
          attemptNumber: 1,
        };
      }
    ),
  };
});

import { ensureStripePaymentIntentForOrder } from '@/lib/services/orders/payment-attempts';

const __prevRateLimitDisabled = process.env.RATE_LIMIT_DISABLED;
const __prevPaymentsEnabled = process.env.PAYMENTS_ENABLED;
const __prevStripePaymentsEnabled = process.env.STRIPE_PAYMENTS_ENABLED;
const __prevStripeSecret = process.env.STRIPE_SECRET_KEY;
const __prevStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const __prevStripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const __prevStatusSecret = process.env.SHOP_STATUS_TOKEN_SECRET;
const __prevAppOrigin = process.env.APP_ORIGIN;

beforeAll(() => {
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_default';
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

  if (__prevStripePaymentsEnabled === undefined)
    delete process.env.STRIPE_PAYMENTS_ENABLED;
  else process.env.STRIPE_PAYMENTS_ENABLED = __prevStripePaymentsEnabled;

  if (__prevStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = __prevStripeSecret;

  if (__prevStripeWebhookSecret === undefined)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = __prevStripeWebhookSecret;

  if (__prevStripePublishableKey === undefined)
    delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  else
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = __prevStripePublishableKey;

  if (__prevStatusSecret === undefined)
    delete process.env.SHOP_STATUS_TOKEN_SECRET;
  else process.env.SHOP_STATUS_TOKEN_SECRET = __prevStatusSecret;

  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;

  resetEnvCache();
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_default';
  resetEnvCache();
});

function setStripeEnv(args: {
  paymentsEnabled: string;
  stripePaymentsEnabled: string;
  stripeSecretKey?: string | null;
  stripeWebhookSecret?: string | null;
  stripePublishableKey?: string | null;
}) {
  process.env.PAYMENTS_ENABLED = args.paymentsEnabled;
  process.env.STRIPE_PAYMENTS_ENABLED = args.stripePaymentsEnabled;

  if (args.stripeSecretKey == null) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = args.stripeSecretKey;

  if (args.stripeWebhookSecret == null)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = args.stripeWebhookSecret;

  if (Object.prototype.hasOwnProperty.call(args, 'stripePublishableKey')) {
    if (args.stripePublishableKey == null)
      delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    else
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
        args.stripePublishableKey;
  }

  resetEnvCache();
}

async function createIsolatedProductWithPrices() {
  const tpl = await getOrSeedActiveTemplateProduct();

  const productId = crypto.randomUUID();
  const slug = `t-stripe-${crypto.randomUUID()}`;
  const sku = `t-stripe-${crypto.randomUUID()}`;
  const now = new Date();

  await db.insert(products).values({
    ...(tpl as any),
    id: productId,
    slug,
    sku,
    title: `Test ${slug}`,
    stock: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  } as any);

  await db.insert(productPrices).values([
    {
      productId,
      currency: 'USD',
      priceMinor: 6700,
      originalPriceMinor: null,
      price: toDbMoney(6700),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      productId,
      currency: 'UAH',
      priceMinor: 10000,
      originalPriceMinor: null,
      price: toDbMoney(10000),
      originalPrice: null,
      createdAt: now,
      updatedAt: now,
    },
  ] as any);

  return { productId };
}

async function cleanupOrder(orderId: string) {
  await db.delete(inventoryMoves).where(eq(inventoryMoves.orderId, orderId));
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function cleanupProduct(productId: string) {
  await db.delete(productPrices).where(eq(productPrices.productId, productId));
  await db.delete(products).where(eq(products.id, productId));
}

async function postCheckout(args: {
  idemKey: string;
  acceptLanguage: string;
  body: Record<string, unknown>;
}) {
  const mod = (await import('@/app/api/shop/checkout/route')) as unknown as {
    POST: (req: NextRequest) => Promise<Response>;
  };

  const req = new NextRequest('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': args.acceptLanguage,
      'idempotency-key': args.idemKey,
      'x-request-id': `stripe-fail-closed-${args.idemKey.slice(0, 8)}`,
      'x-forwarded-for': deriveTestIpFromIdemKey(args.idemKey),
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify(args.body),
  });

  return mod.POST(req);
}

describe.sequential('checkout stripe fail-closed + tamper guards', () => {
  it('explicit stripe request fails closed when stripe rail is disabled by flag', async () => {
    setStripeEnv({
      paymentsEnabled: 'true',
      stripePaymentsEnabled: 'false',
      stripeSecretKey: 'sk_test_dummy',
      stripeWebhookSecret: 'whsec_test_dummy',
    });

    const { productId } = await createIsolatedProductWithPrices();
    const idemKey = crypto.randomUUID();
    let createdOrderId: string | null = null;

    try {
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en-US',
        body: {
          paymentProvider: 'stripe',
          items: [{ productId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeUndefined();
      expect(ensureStripePaymentIntentForOrder).not.toHaveBeenCalled();
      createdOrderId = null;
    } finally {
      if (createdOrderId) await cleanupOrder(createdOrderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('explicit stripe request fails closed when stripe runtime is misconfigured', async () => {
    setStripeEnv({
      paymentsEnabled: 'true',
      stripePaymentsEnabled: 'true',
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: 'pk_test_dummy',
    });

    const { productId } = await createIsolatedProductWithPrices();
    const idemKey = crypto.randomUUID();
    let createdOrderId: string | null = null;

    try {
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en-US',
        body: {
          paymentProvider: 'stripe',
          items: [{ productId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeUndefined();
      expect(ensureStripePaymentIntentForOrder).not.toHaveBeenCalled();
      createdOrderId = null;
    } finally {
      if (createdOrderId) await cleanupOrder(createdOrderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('explicit stripe request fails closed when stripe publishable key is missing', async () => {
    setStripeEnv({
      paymentsEnabled: 'true',
      stripePaymentsEnabled: 'true',
      stripeSecretKey: 'sk_test_dummy',
      stripeWebhookSecret: 'whsec_test_dummy',
      stripePublishableKey: null,
    });

    const { productId } = await createIsolatedProductWithPrices();
    const idemKey = crypto.randomUUID();

    try {
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en-US',
        body: {
          paymentProvider: 'stripe',
          items: [{ productId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(503);
      const json: any = await res.json();
      expect(json.code).toBe('PSP_UNAVAILABLE');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeUndefined();
      expect(ensureStripePaymentIntentForOrder).not.toHaveBeenCalled();
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('stripe path ignores client paymentCurrency tampering and persists server-derived totals', async () => {
    setStripeEnv({
      paymentsEnabled: 'true',
      stripePaymentsEnabled: 'true',
      stripeSecretKey: 'sk_test_dummy',
      stripeWebhookSecret: 'whsec_test_dummy',
    });

    const { productId } = await createIsolatedProductWithPrices();
    const idemKey = crypto.randomUUID();
    let createdOrderId: string | null = null;

    try {
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en-US,en;q=0.9',
        body: {
          paymentProvider: 'stripe',
          paymentMethod: 'stripe_card',
          paymentCurrency: 'UAH',
          items: [{ productId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(201);
      const json: any = await res.json();
      expect(json?.order?.paymentProvider).toBe('stripe');
      expect(json?.order?.currency).toBe('USD');
      expect(json?.order?.totalAmount).toBe(67);
      expect(typeof json?.clientSecret).toBe('string');

      const [row] = await db
        .select({
          id: orders.id,
          currency: orders.currency,
          totalAmountMinor: orders.totalAmountMinor,
          paymentProvider: orders.paymentProvider,
          paymentStatus: orders.paymentStatus,
        })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeTruthy();
      expect(row?.currency).toBe('USD');
      expect(row?.totalAmountMinor).toBe(6700);
      expect(row?.paymentProvider).toBe('stripe');
      expect(row?.paymentStatus).toBe('pending');
      createdOrderId = row?.id ?? null;
    } finally {
      if (createdOrderId) await cleanupOrder(createdOrderId);
      await cleanupProduct(productId);
    }
  }, 30_000);

  it('stripe path rejects client-supplied total fields and creates no order', async () => {
    setStripeEnv({
      paymentsEnabled: 'true',
      stripePaymentsEnabled: 'true',
      stripeSecretKey: 'sk_test_dummy',
      stripeWebhookSecret: 'whsec_test_dummy',
    });

    const { productId } = await createIsolatedProductWithPrices();
    const idemKey = crypto.randomUUID();

    try {
      const res = await postCheckout({
        idemKey,
        acceptLanguage: 'en-US,en;q=0.9',
        body: {
          paymentProvider: 'stripe',
          paymentMethod: 'stripe_card',
          totalAmount: 1,
          totalAmountMinor: 1,
          items: [{ productId, quantity: 1 }],
        },
      });

      expect(res.status).toBe(400);
      const json: any = await res.json();
      expect(json.code).toBe('INVALID_PAYLOAD');

      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.idempotencyKey, idemKey))
        .limit(1);

      expect(row).toBeUndefined();
      expect(ensureStripePaymentIntentForOrder).not.toHaveBeenCalled();
    } finally {
      await cleanupProduct(productId);
    }
  }, 30_000);
});
