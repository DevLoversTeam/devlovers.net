import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders } from '@/db/schema';
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
  await db.delete(orders).where(eq(orders.id, orderId));
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

      const json = await res.json();
      expect(json.order.id).toBe(orderId);
      expect(json.order.paymentStatus).toBe('pending');

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
    } finally {
      await deleteOrder(orderId);
    }
  });
});
