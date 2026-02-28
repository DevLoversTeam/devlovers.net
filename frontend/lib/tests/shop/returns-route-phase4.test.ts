import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orderItems, orders, products, returnRequests, users } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth', () => ({
  getCurrentUser: getCurrentUserMock,
}));

async function ensureUser(userId: string) {
  await db
    .insert(users)
    .values({
      id: userId,
      email: `${userId}@example.test`,
      role: 'user',
      name: 'Test User',
    } as any)
    .onConflictDoNothing();
}

async function seedOwnedOrder(args: { userId: string }) {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  await ensureUser(args.userId);
  await db.insert(products).values({
    id: productId,
    slug: `returns-route-${crypto.randomUUID()}`,
    title: 'Returns route test product',
    imageUrl: 'https://example.com/p.png',
    price: toDbMoney(1200),
    currency: 'USD',
    stock: 10,
    isActive: true,
    isFeatured: false,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    userId: args.userId,
    totalAmountMinor: 2400,
    totalAmount: toDbMoney(2400),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    paymentIntentId: `pi_${crypto.randomUUID()}`,
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
  } as any);

  await db.insert(orderItems).values([
    {
      id: crypto.randomUUID(),
      orderId,
      productId,
      selectedSize: '',
      selectedColor: '',
      quantity: 1,
      unitPriceMinor: 1200,
      lineTotalMinor: 1200,
      unitPrice: toDbMoney(1200),
      lineTotal: toDbMoney(1200),
      productTitle: 'Returns route test product',
      productSlug: 'returns-route-test-product',
    },
    {
      id: crypto.randomUUID(),
      orderId,
      productId,
      selectedSize: 'm',
      selectedColor: 'black',
      quantity: 1,
      unitPriceMinor: 1200,
      lineTotalMinor: 1200,
      unitPrice: toDbMoney(1200),
      lineTotal: toDbMoney(1200),
      productTitle: 'Returns route test product',
      productSlug: 'returns-route-test-product',
    },
  ] as any);

  return { orderId, productId };
}

async function cleanup(orderId: string, productId: string) {
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
  await db.delete(products).where(eq(products.id, productId));
}

describe.sequential('returns customer route phase 4', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('create return contract: owner can create and refund amount is server-derived', async () => {
    const userId = `user_${crypto.randomUUID()}`;
    getCurrentUserMock.mockResolvedValue({
      id: userId,
      role: 'user',
    });

    const seed = await seedOwnedOrder({ userId });

    try {
      const { POST } = await import('@/app/api/shop/orders/[id]/returns/route');
      const request = new NextRequest(
        `http://localhost:3000/api/shop/orders/${seed.orderId}/returns`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            idempotencyKey: `ret_${crypto.randomUUID()}`,
            reason: 'arrived damaged',
            policyRestock: true,
          }),
        }
      );

      const response = await POST(request, {
        params: Promise.resolve({ id: seed.orderId }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.returnRequest.status).toBe('requested');
      expect(json.returnRequest.currency).toBe('USD');
      expect(json.returnRequest.refundAmountMinor).toBe(2400);
      expect(Array.isArray(json.returnRequest.items)).toBe(true);
      expect(json.returnRequest.items.length).toBe(2);
    } finally {
      await cleanup(seed.orderId, seed.productId);
    }
  });

  it('rejects exchange intent with stable contract code', async () => {
    const userId = `user_${crypto.randomUUID()}`;
    getCurrentUserMock.mockResolvedValue({
      id: userId,
      role: 'user',
    });

    const seed = await seedOwnedOrder({ userId });

    try {
      const { POST } = await import('@/app/api/shop/orders/[id]/returns/route');
      const request = new NextRequest(
        `http://localhost:3000/api/shop/orders/${seed.orderId}/returns`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://localhost:3000',
          },
          body: JSON.stringify({
            idempotencyKey: `ret_${crypto.randomUUID()}`,
            reason: 'need another size',
            policyRestock: true,
            resolution: 'exchange',
          }),
        }
      );

      const response = await POST(request, {
        params: Promise.resolve({ id: seed.orderId }),
      });

      expect(response.status).toBe(422);
      const json = await response.json();
      expect(json.code).toBe('EXCHANGES_NOT_SUPPORTED');

      const existing = await db
        .select({ id: returnRequests.id })
        .from(returnRequests)
        .where(eq(returnRequests.orderId, seed.orderId));
      expect(existing).toHaveLength(0);
    } finally {
      await cleanup(seed.orderId, seed.productId);
    }
  });
});
