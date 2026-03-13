import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  adminAuditLog,
  orderItems,
  orders,
  products,
  returnRequests,
  shippingEvents,
  users,
} from '@/db/schema';
import {
  approveReturnRequest,
  createReturnRequest,
  receiveReturnRequest,
} from '@/lib/services/shop/returns';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/auth/admin', () => ({
  requireAdminApi: vi.fn(async () => ({ id: 'admin_return_refund', role: 'admin' })),
  AdminApiDisabledError: class AdminApiDisabledError extends Error {},
  AdminUnauthorizedError: class AdminUnauthorizedError extends Error {
    code = 'ADMIN_UNAUTHORIZED';
  },
  AdminForbiddenError: class AdminForbiddenError extends Error {
    code = 'ADMIN_FORBIDDEN';
  },
}));

vi.mock('@/lib/security/admin-csrf', () => ({
  requireAdminCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
  };
});

const __prevAppOrigin = process.env.APP_ORIGIN;

beforeAll(() => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
});

afterAll(() => {
  if (__prevAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = __prevAppOrigin;
});

type Seed = {
  orderId: string;
  productId: string;
  userId: string;
  returnRequestId: string;
};

async function ensureUser(id: string, role: 'user' | 'admin') {
  await db
    .insert(users)
    .values({
      id,
      email: `${id}@example.test`,
      role,
      name: id,
    } as any)
    .onConflictDoNothing();
}

async function seedReceivedReturn(): Promise<Seed> {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const userId = `user_${crypto.randomUUID()}`;
  const adminId = 'admin_return_refund';

  await ensureUser(userId, 'user');
  await ensureUser(adminId, 'admin');

  await db.insert(products).values({
    id: productId,
    slug: `returns-disabled-${crypto.randomUUID()}`,
    title: 'Returns disabled product',
    imageUrl: 'https://example.com/p.png',
    price: toDbMoney(1000),
    currency: 'USD',
    stock: 3,
    isActive: true,
    isFeatured: false,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    userId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    paymentIntentId: `pi_${crypto.randomUUID()}`,
    pspChargeId: `ch_${crypto.randomUUID()}`,
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
  } as any);

  await db.insert(orderItems).values({
    id: crypto.randomUUID(),
    orderId,
    productId,
    selectedSize: '',
    selectedColor: '',
    quantity: 1,
    unitPriceMinor: 1000,
    lineTotalMinor: 1000,
    unitPrice: toDbMoney(1000),
    lineTotal: toDbMoney(1000),
    productTitle: 'Returns disabled product',
    productSlug: 'returns-disabled-product',
  } as any);

  const created = await createReturnRequest({
    orderId,
    actorUserId: userId,
    idempotencyKey: `ret_${crypto.randomUUID()}`,
    reason: 'wrong size',
    policyRestock: false,
    requestId: `req_${crypto.randomUUID()}`,
  });

  await approveReturnRequest({
    returnRequestId: created.request.id,
    actorUserId: adminId,
    requestId: `req_${crypto.randomUUID()}`,
  });

  await receiveReturnRequest({
    returnRequestId: created.request.id,
    actorUserId: adminId,
    requestId: `req_${crypto.randomUUID()}`,
  });

  return {
    orderId,
    productId,
    userId,
    returnRequestId: created.request.id,
  };
}

async function cleanup(seed: Seed) {
  await db
    .delete(adminAuditLog)
    .where(eq(adminAuditLog.orderId, seed.orderId));
  await db
    .delete(shippingEvents)
    .where(eq(shippingEvents.orderId, seed.orderId));
  await db
    .delete(returnRequests)
    .where(eq(returnRequests.id, seed.returnRequestId));
  await db.delete(orderItems).where(eq(orderItems.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(products).where(eq(products.id, seed.productId));
  await db
    .delete(users)
    .where(and(eq(users.id, seed.userId), eq(users.role, 'user')));
  await db
    .delete(users)
    .where(and(eq(users.id, 'admin_return_refund'), eq(users.role, 'admin')));
}

describe.sequential('return refunds disabled for launch', () => {
  it('route fails closed and leaves return state unchanged', async () => {
    const seed = await seedReceivedReturn();

    try {
      const { POST } =
        await import('@/app/api/shop/admin/returns/[id]/refund/route');

      const req = new NextRequest(
        `http://localhost/api/shop/admin/returns/${seed.returnRequestId}/refund`,
        {
          method: 'POST',
          headers: { origin: 'http://localhost:3000' },
        }
      );

      const res = await POST(req, {
        params: Promise.resolve({ id: seed.returnRequestId }),
      });

      expect(res.status).toBe(409);
      const json: any = await res.json();
      expect(json.code).toBe('RETURN_REFUND_DISABLED');

      const [row] = await db
        .select({
          status: returnRequests.status,
          refundedAt: returnRequests.refundedAt,
          refundProviderRef: returnRequests.refundProviderRef,
        })
        .from(returnRequests)
        .where(eq(returnRequests.id, seed.returnRequestId))
        .limit(1);

      expect(row?.status).toBe('received');
      expect(row?.refundedAt).toBeNull();
      expect(row?.refundProviderRef).toBeNull();
    } finally {
      await cleanup(seed);
    }
  });
});
