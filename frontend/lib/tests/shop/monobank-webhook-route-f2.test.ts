import crypto from 'node:crypto';

import { and, eq, or } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { toDbMoney } from '@/lib/shop/money';

const verifyWebhookSignatureWithRefreshMock = vi.fn(
  async (..._args: unknown[]) => true
);

vi.mock('@/lib/psp/monobank', () => ({
  verifyWebhookSignatureWithRefresh: (args: unknown) =>
    verifyWebhookSignatureWithRefreshMock(args),
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

const ENV_KEYS = ['MONO_WEBHOOK_MODE'];
const previousEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
  }
  process.env.MONO_WEBHOOK_MODE = 'apply';
  resetEnvCache();
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

async function insertOrderAndAttempt(invoiceId: string) {
  const orderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'pending',
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    idempotencyKey: crypto.randomUUID(),
  } as any);

  const attemptId = crypto.randomUUID();
  await db.insert(paymentAttempts).values({
    id: attemptId,
    orderId,
    provider: 'monobank',
    status: 'active',
    attemptNumber: 1,
    currency: 'UAH',
    expectedAmountMinor: 1000,
    idempotencyKey: buildMonobankAttemptIdempotencyKey(orderId, 1),
    providerPaymentIntentId: invoiceId,
  } as any);

  return { orderId };
}

async function cleanup(orderId: string, invoiceId: string) {
  await db
    .delete(monobankEvents)
    .where(
      or(
        eq(monobankEvents.orderId, orderId),
        eq(monobankEvents.invoiceId, invoiceId)
      )
    );
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function postWebhookRaw(rawBody: string, signature = 'test-signature') {
  const { POST } = await import('@/app/api/shop/webhooks/monobank/route');

  const req = new NextRequest('http://localhost/api/shop/webhooks/monobank', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sign': signature,
      'x-request-id': 'mono-webhook-route-f2',
    },
    body: rawBody,
  });

  return POST(req);
}

describe.sequential('monobank webhook route F2', () => {
  it('invalid signature: no event write and no order/attempt state changes', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(false);

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);
    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      modifiedDate: Date.now(),
    });
    const rawSha256 = crypto.createHash('sha256').update(rawBody).digest('hex');

    try {
      const res = await postWebhookRaw(rawBody, 'bad-signature');
      expect(res.status).toBe(200);
      const json: any = await res.json();
      expect(json.ok).toBe(true);

      const events = await db
        .select({ id: monobankEvents.id })
        .from(monobankEvents)
        .where(eq(monobankEvents.rawSha256, rawSha256));
      expect(events.length).toBe(0);

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('pending');

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);
      expect(attempt?.status).toBe('active');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('dedupe: same raw payload is inserted once and applied once', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(true);

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);
    const rawBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      modifiedDate: Date.now(),
    });
    const rawSha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
    const eventKey = rawSha256;

    try {
      const first = await postWebhookRaw(rawBody);
      const second = await postWebhookRaw(rawBody);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const events = await db
        .select({
          id: monobankEvents.id,
          appliedResult: monobankEvents.appliedResult,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.eventKey, eventKey));
      expect(events.length).toBe(1);
      expect(events[0]?.appliedResult).toBe('applied');

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });

  it('out-of-order: older event does not revert paid state', async () => {
    verifyWebhookSignatureWithRefreshMock.mockResolvedValue(true);

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);
    const now = Date.now();

    const successBody = JSON.stringify({
      invoiceId,
      status: 'success',
      amount: 1000,
      ccy: 980,
      modifiedDate: now,
    });
    const olderBody = JSON.stringify({
      invoiceId,
      status: 'processing',
      amount: 1000,
      ccy: 980,
      modifiedDate: now - 60_000,
    });

    try {
      const first = await postWebhookRaw(successBody);
      const second = await postWebhookRaw(olderBody);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);

      const [order] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');

      const [olderEvent] = await db
        .select({
          appliedResult: monobankEvents.appliedResult,
          appliedErrorCode: monobankEvents.appliedErrorCode,
        })
        .from(monobankEvents)
        .where(
          and(
            eq(monobankEvents.invoiceId, invoiceId),
            eq(monobankEvents.status, 'processing')
          )
        )
        .limit(1);
      expect(olderEvent?.appliedResult).toBe('applied_noop');
      expect(olderEvent?.appliedErrorCode).toBe('OUT_OF_ORDER');
    } finally {
      await cleanup(orderId, invoiceId);
    }
  });
});
