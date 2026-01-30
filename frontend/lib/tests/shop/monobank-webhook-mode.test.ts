import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { monobankEvents, orders, paymentAttempts } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { buildMonobankAttemptIdempotencyKey } from '@/lib/services/orders/attempt-idempotency';
import { resetEnvCache } from '@/lib/env';

vi.mock('@/lib/psp/monobank', () => ({
  verifyMonobankWebhookSignature: vi.fn(async () => true),
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
  for (const key of ENV_KEYS) {
    previousEnv[key] = process.env[key];
    delete process.env[key];
  }
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

  return { orderId, attemptId };
}

async function cleanup(orderId: string) {
  await db.delete(monobankEvents).where(eq(monobankEvents.orderId, orderId));
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function postWebhook(payload: Record<string, unknown>) {
  const { POST } = await import('@/app/api/shop/webhooks/monobank/route');
  const req = new NextRequest('http://localhost/api/shop/webhooks/monobank', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sign': 'test-signature',
      'x-request-id': 'mono-webhook-test',
    },
    body: JSON.stringify(payload),
  });
  return POST(req);
}

describe.sequential('monobank webhook mode handling', () => {
  it('drops events without applying or storing', async () => {
    process.env.MONO_WEBHOOK_MODE = 'drop';
    resetEnvCache();

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);

    try {
      const res = await postWebhook({ invoiceId, status: 'success' });
      expect(res.status).toBe(200);

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

      const [event] = await db
        .select({ id: monobankEvents.id })
        .from(monobankEvents)
        .where(eq(monobankEvents.orderId, orderId))
        .limit(1);
      expect(event).toBeUndefined();
    } finally {
      await cleanup(orderId);
    }
  });

  it('stores events without applying updates', async () => {
    process.env.MONO_WEBHOOK_MODE = 'store';
    resetEnvCache();

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);
    const payload = { invoiceId, status: 'success', amount: 1000, ccy: 980 };
    const rawHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      const res = await postWebhook(payload);
      expect(res.status).toBe(200);

      const [event] = await db
        .select({
          rawSha256: monobankEvents.rawSha256,
          invoiceId: monobankEvents.invoiceId,
        })
        .from(monobankEvents)
        .where(eq(monobankEvents.orderId, orderId))
        .limit(1);

      expect(event?.invoiceId).toBe(invoiceId);
      expect(event?.rawSha256).toBe(rawHash);

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
      await cleanup(orderId);
    }
  });

  it('applies updates when mode=apply', async () => {
    process.env.MONO_WEBHOOK_MODE = 'apply';
    resetEnvCache();

    const invoiceId = `inv_${crypto.randomUUID()}`;
    const { orderId } = await insertOrderAndAttempt(invoiceId);

    try {
      const res = await postWebhook({ invoiceId, status: 'success' });
      expect(res.status).toBe(200);

      const [order] = await db
        .select({
          paymentStatus: orders.paymentStatus,
          status: orders.status,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.status).toBe('PAID');

      const [attempt] = await db
        .select({ status: paymentAttempts.status })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, orderId))
        .limit(1);
      expect(attempt?.status).toBe('succeeded');
    } finally {
      await cleanup(orderId);
    }
  });
});
