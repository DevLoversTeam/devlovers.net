import crypto from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  adminAuditLog,
  inventoryMoves,
  orderItems,
  orders,
  products,
  shippingEvents,
  users,
} from '@/db/schema';
import { InvalidPayloadError } from '@/lib/services/errors';
import {
  approveReturnRequest,
  createReturnRequest,
  receiveReturnRequest,
  refundReturnRequest,
  rejectReturnRequest,
} from '@/lib/services/shop/returns';
import { toDbMoney } from '@/lib/shop/money';

const createRefundMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/psp/stripe', () => ({
  createRefund: createRefundMock,
}));

type Seed = {
  orderId: string;
  productId: string;
  userId: string;
};
async function ensureAdmin(userId: string) {
  await db
    .insert(users)
    .values({
      id: userId,
      email: `${userId}@example.test`,
      role: 'admin',
      name: 'Test Admin',
    } as any)
    .onConflictDoNothing();
}
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

async function seedPaidReservedOrder(args?: {
  stockAfterReserve?: number;
  qty?: number;
  unitPriceMinor?: number;
}) {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const userId = `user_${crypto.randomUUID()}`;
  const qty = args?.qty ?? 2;
  const unitPriceMinor = args?.unitPriceMinor ?? 1000;
  const lineTotalMinor = qty * unitPriceMinor;
  const stockAfterReserve = args?.stockAfterReserve ?? 3;
  await ensureUser(userId);
  await db.insert(products).values({
    id: productId,
    slug: `returns-phase4-${crypto.randomUUID()}`,
    title: 'Returns test product',
    imageUrl: 'https://example.com/p.png',
    price: toDbMoney(unitPriceMinor),
    currency: 'USD',
    stock: stockAfterReserve,
    isActive: true,
    isFeatured: false,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    userId,
    totalAmountMinor: lineTotalMinor,
    totalAmount: toDbMoney(lineTotalMinor),
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
    quantity: qty,
    unitPriceMinor,
    lineTotalMinor,
    unitPrice: toDbMoney(unitPriceMinor),
    lineTotal: toDbMoney(lineTotalMinor),
    productTitle: 'Returns test product',
    productSlug: 'returns-test-product',
  } as any);

  await db.insert(inventoryMoves).values({
    moveKey: `reserve:${orderId}:${productId}`,
    orderId,
    productId,
    type: 'reserve',
    quantity: qty,
  } as any);

  return { orderId, productId, userId } satisfies Seed;
}

async function cleanupSeed(seed: Seed) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, seed.orderId));
  await db
    .delete(shippingEvents)
    .where(eq(shippingEvents.orderId, seed.orderId));
  await db
    .delete(inventoryMoves)
    .where(eq(inventoryMoves.orderId, seed.orderId));
  await db.delete(orderItems).where(eq(orderItems.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(products).where(eq(products.id, seed.productId));
}

describe.sequential('returns phase 4', () => {
  it('transition matrix allows/forbids correctly', async () => {
    const seed = await seedPaidReservedOrder();
    try {
      const created = await createReturnRequest({
        orderId: seed.orderId,
        actorUserId: seed.userId,
        idempotencyKey: `ret_${crypto.randomUUID()}`,
        reason: 'size mismatch',
        policyRestock: true,
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(created.created).toBe(true);
      expect(created.request.status).toBe('requested');

      await ensureAdmin('admin_1');

      const approved = await approveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_1',
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(approved.changed).toBe(true);
      expect(approved.row.status).toBe('approved');

      await expect(
        rejectReturnRequest({
          returnRequestId: created.request.id,
          actorUserId: 'admin_1',
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'RETURN_TRANSITION_INVALID',
      } satisfies Partial<InvalidPayloadError>);

      const received = await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_1',
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(received.changed).toBe(true);
      expect(received.row.status).toBe('received');

      await expect(
        approveReturnRequest({
          returnRequestId: created.request.id,
          actorUserId: 'admin_1',
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'RETURN_TRANSITION_INVALID',
      } satisfies Partial<InvalidPayloadError>);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('refund is allowed only after receive state', async () => {
    const seed = await seedPaidReservedOrder();
    try {
      const created = await createReturnRequest({
        orderId: seed.orderId,
        actorUserId: seed.userId,
        idempotencyKey: `ret_${crypto.randomUUID()}`,
        reason: 'wrong size',
        policyRestock: true,
        requestId: `req_${crypto.randomUUID()}`,
      });
      await ensureAdmin('admin_2');

      await approveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_2',
        requestId: `req_${crypto.randomUUID()}`,
      });

      await expect(
        refundReturnRequest({
          returnRequestId: created.request.id,
          actorUserId: 'admin_2',
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'RETURN_REFUND_STATE_INVALID',
      } satisfies Partial<InvalidPayloadError>);

      await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_2',
        requestId: `req_${crypto.randomUUID()}`,
      });

      createRefundMock.mockResolvedValueOnce({
        refundId: `re_${crypto.randomUUID()}`,
        status: 'succeeded',
      });

      const refunded = await refundReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_2',
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(refunded.changed).toBe(true);
      expect(refunded.row.status).toBe('refunded');
      expect(createRefundMock).toHaveBeenCalledTimes(1);
      expect(createRefundMock).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: seed.orderId,
          amountMinor: created.request.refundAmountMinor,
        })
      );
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('restock path is idempotent on repeated receive', async () => {
    const seed = await seedPaidReservedOrder({ stockAfterReserve: 3, qty: 2 });
    try {
      const created = await createReturnRequest({
        orderId: seed.orderId,
        actorUserId: seed.userId,
        idempotencyKey: `ret_${crypto.randomUUID()}`,
        reason: 'damaged',
        policyRestock: true,
        requestId: `req_${crypto.randomUUID()}`,
      });
      await ensureAdmin('admin_3');

      await approveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_3',
        requestId: `req_${crypto.randomUUID()}`,
      });
      const firstReceive = await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_3',
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(firstReceive.changed).toBe(true);

      const [stockAfterFirst] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, seed.productId))
        .limit(1);
      expect(stockAfterFirst?.stock).toBe(5);

      const secondReceive = await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_3',
        requestId: `req_${crypto.randomUUID()}`,
      });
      expect(secondReceive.changed).toBe(false);

      const [stockAfterSecond] = await db
        .select({ stock: products.stock })
        .from(products)
        .where(eq(products.id, seed.productId))
        .limit(1);
      expect(stockAfterSecond?.stock).toBe(5);

      const releases = await db
        .select({ moveKey: inventoryMoves.moveKey })
        .from(inventoryMoves)
        .where(
          and(
            eq(inventoryMoves.orderId, seed.orderId),
            eq(inventoryMoves.productId, seed.productId),
            eq(inventoryMoves.type, 'release')
          )
        );
      expect(releases.length).toBe(1);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('emits canonical shipping events and admin audit entries for return transitions', async () => {
    const seed = await seedPaidReservedOrder();
    try {
      const created = await createReturnRequest({
        orderId: seed.orderId,
        actorUserId: seed.userId,
        idempotencyKey: `ret_${crypto.randomUUID()}`,
        reason: 'quality issue',
        policyRestock: true,
        requestId: `req_${crypto.randomUUID()}`,
      });
      await ensureAdmin('admin_4');

      await approveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_4',
        requestId: `req_${crypto.randomUUID()}`,
      });
      await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_4',
        requestId: `req_${crypto.randomUUID()}`,
      });

      createRefundMock.mockResolvedValueOnce({
        refundId: `re_${crypto.randomUUID()}`,
        status: 'succeeded',
      });
      await refundReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin_4',
        requestId: `req_${crypto.randomUUID()}`,
      });

      const events = await db
        .select({
          eventName: shippingEvents.eventName,
          provider: shippingEvents.provider,
        })
        .from(shippingEvents)
        .where(
          and(
            eq(shippingEvents.orderId, seed.orderId),
            eq(shippingEvents.provider, 'returns')
          )
        );

      expect(events.map(e => e.eventName)).toEqual(
        expect.arrayContaining([
          'return_requested',
          'return_approved',
          'return_received',
          'return_refunded',
        ])
      );

      const audits = await db
        .select({
          action: adminAuditLog.action,
        })
        .from(adminAuditLog)
        .where(
          and(
            eq(adminAuditLog.orderId, seed.orderId),
            sql`${adminAuditLog.action} like 'return.%'`
          )
        );

      expect(audits.map(a => a.action)).toEqual(
        expect.arrayContaining([
          'return.requested',
          'return.approve',
          'return.receive',
          'return.refund',
        ])
      );
    } finally {
      await cleanupSeed(seed);
      await db.delete(users).where(eq(users.id, seed.userId));
      await db
        .delete(users)
        .where(sql`${users.id} in ('admin_1','admin_2','admin_3','admin_4')`);
    }
  });
});
