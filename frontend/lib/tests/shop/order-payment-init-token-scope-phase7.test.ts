import crypto from 'node:crypto';

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
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { createStatusToken } from '@/lib/shop/status-token';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: vi.fn(),
    logError: vi.fn(),
    logInfo: vi.fn(),
  };
});

const ensureStripePaymentIntentForOrderMock = vi.fn(
  async (..._args: unknown[]) => ({
    paymentIntentId: `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    clientSecret: `cs_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    attemptId: crypto.randomUUID(),
    attemptNumber: 1,
  })
);

vi.mock('@/lib/services/orders/payment-attempts', () => ({
  PaymentAttemptsExhaustedError: class PaymentAttemptsExhaustedError extends Error {
    code = 'PAYMENT_ATTEMPTS_EXHAUSTED' as const;
    orderId: string | null = null;
    provider = 'stripe' as const;
  },
  ensureStripePaymentIntentForOrder: (...args: unknown[]) =>
    ensureStripePaymentIntentForOrderMock(...args),
}));

vi.mock('@/lib/services/shop/quotes', () => ({
  assertIntlPaymentInitAllowed: vi.fn(async () => undefined),
}));

const previousStatusSecret = process.env.SHOP_STATUS_TOKEN_SECRET;

beforeAll(() => {
  process.env.SHOP_STATUS_TOKEN_SECRET =
    'test_status_token_secret_test_status_token_secret';
});

afterAll(() => {
  if (previousStatusSecret === undefined) {
    delete process.env.SHOP_STATUS_TOKEN_SECRET;
  } else {
    process.env.SHOP_STATUS_TOKEN_SECRET = previousStatusSecret;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function insertOrder(orderId: string) {
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: crypto.randomUUID(),
    fulfillmentMode: 'intl',
  } as any);
}

async function deleteOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeRequest(orderId: string, statusToken?: string) {
  const base = `http://localhost/api/shop/orders/${orderId}/payment/init`;
  const url = statusToken
    ? `${base}?statusToken=${encodeURIComponent(statusToken)}`
    : base;

  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      'x-request-id': 'phase7-payment-init-scope',
    },
    body: JSON.stringify({ provider: 'stripe' }),
  });
}

describe.sequential('order payment init token scope (phase 7)', () => {
  it('rejects token without order_payment_init scope and allows scoped token', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      const { POST } =
        await import('@/app/api/shop/orders/[id]/payment/init/route');

      const unscopedToken = createStatusToken({ orderId });
      const unscopedRes = await POST(makeRequest(orderId, unscopedToken), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(unscopedRes.status).toBe(403);
      const unscopedJson: any = await unscopedRes.json();
      expect(unscopedJson.code).toBe('STATUS_TOKEN_SCOPE_FORBIDDEN');
      expect(ensureStripePaymentIntentForOrderMock).not.toHaveBeenCalled();

      const scopedToken = createStatusToken({
        orderId,
        scopes: ['order_payment_init'],
      });
      const scopedRes = await POST(makeRequest(orderId, scopedToken), {
        params: Promise.resolve({ id: orderId }),
      });
      expect(scopedRes.status).toBe(200);
      const scopedJson: any = await scopedRes.json();
      expect(scopedJson.success).toBe(true);
      expect(scopedJson.orderId).toBe(orderId);
      expect(scopedJson.provider).toBe('stripe');
      expect(typeof scopedJson.paymentIntentId).toBe('string');
      expect(typeof scopedJson.clientSecret).toBe('string');
      expect(ensureStripePaymentIntentForOrderMock).toHaveBeenCalledTimes(1);
    } finally {
      await deleteOrder(orderId);
    }
  });
});
