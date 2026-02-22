import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import { createStatusToken } from '@/lib/shop/status-token';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

const __prevStatusSecret = process.env.SHOP_STATUS_TOKEN_SECRET;

beforeAll(() => {
  process.env.SHOP_STATUS_TOKEN_SECRET =
    'test_status_token_secret_test_status_token_secret';
});

afterAll(() => {
  if (__prevStatusSecret === undefined)
    delete process.env.SHOP_STATUS_TOKEN_SECRET;
  else process.env.SHOP_STATUS_TOKEN_SECRET = __prevStatusSecret;
});

async function insertOrder(orderId: string) {
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
}

async function deleteOrder(orderId: string) {
  await db.delete(paymentAttempts).where(eq(paymentAttempts.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function insertAttempt(args: {
  orderId: string;
  status: 'creating' | 'active' | 'succeeded' | 'failed' | 'canceled';
  attemptNumber: number;
  providerRef: string | null;
  checkoutUrl?: string | null;
  metadata?: Record<string, unknown>;
  updatedAt?: Date;
}) {
  const createdAt = new Date((args.updatedAt ?? new Date()).getTime() - 1_000);

  await db.insert(paymentAttempts).values({
    id: crypto.randomUUID(),
    orderId: args.orderId,
    provider: 'monobank',
    status: args.status,
    attemptNumber: args.attemptNumber,
    currency: 'UAH',
    expectedAmountMinor: 1000,
    idempotencyKey: crypto.randomUUID(),
    providerPaymentIntentId: args.providerRef,
    checkoutUrl: args.checkoutUrl ?? null,
    metadata: args.metadata ?? {},
    createdAt,
    updatedAt: args.updatedAt ?? new Date(),
  } as any);
}

describe('order status token access control', () => {
  it('requires token when no session', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(401);
      const json: any = await res.json();
      expect(json.code).toBe('STATUS_TOKEN_REQUIRED');
    } finally {
      await deleteOrder(orderId);
    }
  });

  it('allows access with valid token for that order', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      const token = createStatusToken({ orderId });
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status?statusToken=${encodeURIComponent(
          token
        )}`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(200);

      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.order.id).toBe(orderId);
      expect(typeof json.order.currency).toBe('string');
      expect(json.order.totalAmountMinor).toBeDefined();
      expect(json.order.paymentProvider).toBeDefined();
      expect(json.order.paymentStatus).toBe('pending');
      expect(typeof json.order.createdAt).toBe('string');
      expect(json.attempt).toBeNull();

      const [row] = await db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(row?.paymentStatus).toBe('pending');
    } finally {
      await deleteOrder(orderId);
    }
  });

  it('rejects token for another order', async () => {
    const orderId = crypto.randomUUID();
    const otherOrderId = crypto.randomUUID();
    await insertOrder(orderId);
    await insertOrder(otherOrderId);

    try {
      const token = createStatusToken({ orderId });
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${otherOrderId}/status?statusToken=${encodeURIComponent(
          token
        )}`
      );
      const res = await GET(req, {
        params: Promise.resolve({ id: otherOrderId }),
      });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.code).toBe('STATUS_TOKEN_INVALID');
    } finally {
      await deleteOrder(orderId);
      await deleteOrder(otherOrderId);
    }
  });

  it('rejects expired token', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    try {
      const token = createStatusToken({
        orderId,
        ttlSeconds: 60,
        nowMs: Date.now() - 2 * 60 * 60 * 1000,
      });
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status?statusToken=${encodeURIComponent(
          token
        )}`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(403);
      const json: any = await res.json();
      expect(json.code).toBe('STATUS_TOKEN_INVALID');
    } finally {
      await deleteOrder(orderId);
    }
  });

  it('returns attempt when a payment attempt exists', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);
    await insertAttempt({
      orderId,
      status: 'active',
      attemptNumber: 1,
      providerRef: 'inv_123',
      checkoutUrl: 'https://pay.test/inv_123',
    });

    try {
      const token = createStatusToken({ orderId });
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status?statusToken=${encodeURIComponent(
          token
        )}`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(200);

      const json: any = await res.json();
      expect(json.success).toBe(true);
      expect(json.attempt).not.toBeNull();
      expect(json.attempt.status).toBe('active');
      expect(json.attempt.providerRef).toBe('inv_123');
      expect(json.attempt.checkoutUrl).toBe('https://pay.test/inv_123');
    } finally {
      await deleteOrder(orderId);
    }
  });

  it('prefers creating/active attempt over newer non-active attempt', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    const now = Date.now();
    await insertAttempt({
      orderId,
      status: 'active',
      attemptNumber: 1,
      providerRef: 'inv_active',
      updatedAt: new Date(now - 60_000),
      metadata: { pageUrl: 'https://pay.test/inv_active' },
    });
    await insertAttempt({
      orderId,
      status: 'failed',
      attemptNumber: 2,
      providerRef: 'inv_failed_newer',
      updatedAt: new Date(now),
      checkoutUrl: 'https://pay.test/inv_failed_newer',
    });

    try {
      const token = createStatusToken({ orderId });
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status?statusToken=${encodeURIComponent(
          token
        )}`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(200);

      const json: any = await res.json();
      expect(json.attempt).not.toBeNull();
      expect(json.attempt.status).toBe('active');
      expect(json.attempt.providerRef).toBe('inv_active');
      expect(json.attempt.checkoutUrl).toBe('https://pay.test/inv_active');
    } finally {
      await deleteOrder(orderId);
    }
  });

  it('returns 500 STATUS_TOKEN_MISCONFIGURED when secret is missing and token is provided', async () => {
    const orderId = crypto.randomUUID();
    await insertOrder(orderId);

    const previous = process.env.SHOP_STATUS_TOKEN_SECRET;
    delete process.env.SHOP_STATUS_TOKEN_SECRET;

    try {
      const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
      const req = new NextRequest(
        `http://localhost/api/shop/orders/${orderId}/status?statusToken=invalid.token`
      );
      const res = await GET(req, { params: Promise.resolve({ id: orderId }) });
      expect(res.status).toBe(500);
      const json: any = await res.json();
      expect(json.code).toBe('STATUS_TOKEN_MISCONFIGURED');
    } finally {
      if (previous === undefined) {
        delete process.env.SHOP_STATUS_TOKEN_SECRET;
      } else {
        process.env.SHOP_STATUS_TOKEN_SECRET = previous;
      }
      await deleteOrder(orderId);
    }
  });
});
