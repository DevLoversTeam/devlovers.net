import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendShopNotificationEmailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/services/shop/notifications/transport', () => ({
  sendShopNotificationEmail: (...args: any[]) =>
    sendShopNotificationEmailMock(...args),
  ShopNotificationTransportError: class ShopNotificationTransportError extends Error {
    code: string;
    transient: boolean;

    constructor(code: string, message: string, transient: boolean) {
      super(message);
      this.name = 'ShopNotificationTransportError';
      this.code = code;
      this.transient = transient;
    }
  },
}));

import { db } from '@/db';
import {
  adminAuditLog,
  inventoryMoves,
  notificationOutbox,
  orderItems,
  orders,
  orderShipping,
  paymentEvents,
  products,
  returnRequests,
  shippingEvents,
  shippingShipments,
  users,
} from '@/db/schema';
import { applyAdminOrderLifecycleAction } from '@/lib/services/shop/admin-order-lifecycle';
import { runNotificationOutboxWorker } from '@/lib/services/shop/notifications/outbox-worker';
import { runNotificationOutboxProjector } from '@/lib/services/shop/notifications/projector';
import {
  approveReturnRequest,
  createReturnRequest,
  receiveReturnRequest,
} from '@/lib/services/shop/returns';
import { applyShippingAdminAction } from '@/lib/services/shop/shipping/admin-actions';
import { toDbMoney } from '@/lib/shop/money';

async function ensureUser(args: {
  id: string;
  email: string;
  role?: 'user' | 'admin';
}) {
  await db
    .insert(users)
    .values({
      id: args.id,
      email: args.email,
      role: args.role ?? 'user',
      name: args.email,
    } as any)
    .onConflictDoNothing();
}

async function cleanupUser(userId: string | null) {
  if (!userId) return;
  await db.delete(users).where(eq(users.id, userId));
}

async function cleanupOrder(orderId: string) {
  await db
    .delete(notificationOutbox)
    .where(eq(notificationOutbox.orderId, orderId));
  await db.delete(paymentEvents).where(eq(paymentEvents.orderId, orderId));
  await db.delete(shippingEvents).where(eq(shippingEvents.orderId, orderId));
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db.delete(returnRequests).where(eq(returnRequests.orderId, orderId));
  await db.delete(inventoryMoves).where(eq(inventoryMoves.orderId, orderId));
  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orderShipping).where(eq(orderShipping.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function loadOrderOutboxRow(orderId: string) {
  const [row] = await db
    .select({ status: notificationOutbox.status })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.orderId, orderId))
    .limit(1);

  return row;
}

async function runNotificationWorkerUntilSent(orderId: string, maxRuns = 20) {
  for (let run = 0; run < maxRuns; run += 1) {
    const row = await loadOrderOutboxRow(orderId);
    if (row?.status === 'sent') {
      return row;
    }

    await runNotificationOutboxWorker({
      runId: `notify-worker-${crypto.randomUUID()}`,
      limit: 5000,
      leaseSeconds: 120,
      maxAttempts: 5,
      baseBackoffSeconds: 5,
    });
  }

  return loadOrderOutboxRow(orderId);
}

async function seedShippableOrder(args: {
  orderId: string;
  userId: string | null;
  paymentProvider?: 'stripe' | 'monobank';
  paymentStatus?:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded';
  status?: 'CREATED' | 'INVENTORY_RESERVED' | 'PAID' | 'CANCELED';
  inventoryStatus?:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released';
  shippingStatus?:
    | 'pending'
    | 'label_created'
    | 'shipped'
    | 'cancelled'
    | 'delivered';
  recipientEmail?: string | null;
}) {
  await db.insert(orders).values({
    id: args.orderId,
    userId: args.userId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: args.paymentProvider ?? 'stripe',
    paymentStatus: args.paymentStatus ?? 'paid',
    status: args.status ?? 'PAID',
    inventoryStatus: args.inventoryStatus ?? 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args.shippingStatus ?? 'label_created',
    trackingNumber: '20499900000001',
    idempotencyKey: `status-notify-${args.orderId}`,
  } as any);

  if (args.recipientEmail !== undefined) {
    await db.insert(orderShipping).values({
      orderId: args.orderId,
      shippingAddress: {
        recipient: {
          fullName: 'Status Buyer',
          email: args.recipientEmail,
        },
      },
    } as any);
  }
}

async function seedShipment(orderId: string) {
  await db.insert(shippingShipments).values({
    id: crypto.randomUUID(),
    orderId,
    provider: 'nova_poshta',
    status: 'succeeded',
    attemptCount: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
  } as any);
}

async function seedReturnOrder(): Promise<{
  orderId: string;
  productId: string;
  userId: string;
}> {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const userId = `user_${crypto.randomUUID()}`;

  await ensureUser({
    id: userId,
    email: `${userId}@example.test`,
  });

  await db.insert(products).values({
    id: productId,
    slug: `status-notifications-${productId.slice(0, 8)}`,
    title: 'Status Notifications Product',
    imageUrl: 'https://example.com/status-notifications.png',
    price: toDbMoney(1000),
    currency: 'USD',
    stock: 3,
    isActive: true,
    isFeatured: false,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    userId,
    totalAmountMinor: 2000,
    totalAmount: toDbMoney(2000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    paymentIntentId: `pi_${crypto.randomUUID()}`,
    pspChargeId: `ch_${crypto.randomUUID()}`,
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `status-return-${orderId}`,
  } as any);

  await db.insert(orderItems).values({
    id: crypto.randomUUID(),
    orderId,
    productId,
    selectedSize: '',
    selectedColor: '',
    quantity: 2,
    unitPriceMinor: 1000,
    lineTotalMinor: 2000,
    unitPrice: toDbMoney(1000),
    lineTotal: toDbMoney(2000),
    productTitle: 'Status Notifications Product',
    productSlug: 'status-notifications-product',
  } as any);

  await db.insert(inventoryMoves).values({
    moveKey: `reserve:${orderId}:${productId}`,
    orderId,
    productId,
    type: 'reserve',
    quantity: 2,
  } as any);

  return { orderId, productId, userId };
}

async function cleanupReturnSeed(seed: {
  orderId: string;
  productId: string;
  userId: string;
}) {
  await cleanupOrder(seed.orderId);
  await db.delete(products).where(eq(products.id, seed.productId));
  await cleanupUser(seed.userId);
}

describe.sequential('status notifications phase 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('mark_shipped emits one shipped canonical event and delivers via signed-in account email fallback', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-status-shipped-1',
    });

    const orderId = crypto.randomUUID();
    const userId = `user-${crypto.randomUUID()}`;
    await ensureUser({
      id: userId,
      email: 'signed-in@example.test',
    });
    await seedShippableOrder({
      orderId,
      userId,
      shippingStatus: 'label_created',
    });
    await seedShipment(orderId);

    try {
      const first = await applyShippingAdminAction({
        orderId,
        action: 'mark_shipped',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      });
      const replay = await applyShippingAdminAction({
        orderId,
        action: 'mark_shipped',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(first.changed).toBe(true);
      expect(replay.changed).toBe(false);

      const events = await db
        .select({
          id: shippingEvents.id,
          eventName: shippingEvents.eventName,
          eventSource: shippingEvents.eventSource,
        })
        .from(shippingEvents)
        .where(
          and(
            eq(shippingEvents.orderId, orderId),
            eq(shippingEvents.eventName, 'shipped')
          )
        );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'shipped',
        eventSource: 'shipping_admin_action',
      });

      const firstProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });
      const secondProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(firstProjectorRun.scanned).toBeGreaterThanOrEqual(1);
      expect(secondProjectorRun.scanned).toBeGreaterThanOrEqual(0);

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
          payload: notificationOutbox.payload,
          status: notificationOutbox.status,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_shipped',
        sourceDomain: 'shipping_event',
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'shipped',
        canonicalPayload: {
          paymentStatus: 'paid',
          trackingNumber: '20499900000001',
        },
      });

      const sentRow = await runNotificationWorkerUntilSent(orderId);

      expect(sentRow?.status).toBe('sent');
    } finally {
      await cleanupOrder(orderId);
      await cleanupUser(userId);
    }
  }, 30_000);

  it('cancel emits one order_canceled canonical event and delivers for guest orders through persisted shipping recipient email', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-status-canceled-1',
    });

    const orderId = crypto.randomUUID();
    await seedShippableOrder({
      orderId,
      userId: null,
      paymentStatus: 'pending',
      status: 'CREATED',
      inventoryStatus: 'none',
      shippingStatus: 'pending',
      recipientEmail: 'guest-status@example.test',
    });

    try {
      const first = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'cancel',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      });
      const replay = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'cancel',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(first.changed).toBe(true);
      expect(replay.changed).toBe(false);

      const events = await db
        .select({
          id: paymentEvents.id,
          eventName: paymentEvents.eventName,
          eventSource: paymentEvents.eventSource,
          payload: paymentEvents.payload,
        })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.orderId, orderId),
            eq(paymentEvents.eventName, 'order_canceled')
          )
        );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'order_canceled',
        eventSource: 'order_restock',
      });
      expect(events[0]?.payload).toMatchObject({
        orderStatus: 'CANCELED',
        paymentStatus: 'failed',
        shippingStatus: 'cancelled',
      });

      const firstProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });
      const secondProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(firstProjectorRun.scanned).toBeGreaterThanOrEqual(1);
      expect(secondProjectorRun.scanned).toBeGreaterThanOrEqual(0);

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
          payload: notificationOutbox.payload,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_canceled',
        sourceDomain: 'payment_event',
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'order_canceled',
        canonicalPayload: {
          orderStatus: 'CANCELED',
          paymentStatus: 'failed',
        },
      });

      const sentRow = await runNotificationWorkerUntilSent(orderId);

      expect(sentRow?.status).toBe('sent');
    } finally {
      await cleanupOrder(orderId);
    }
  }, 30_000);

  it('return_received maps to order_returned notification and renders from persisted canonical payload data', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-status-returned-1',
    });

    const seed = await seedReturnOrder();

    try {
      const created = await createReturnRequest({
        orderId: seed.orderId,
        actorUserId: seed.userId,
        idempotencyKey: `ret_${crypto.randomUUID()}`,
        reason: 'size mismatch',
        policyRestock: true,
        requestId: `req_${crypto.randomUUID()}`,
      });

      await ensureUser({
        id: 'admin-status-1',
        email: 'admin-status-1@example.test',
        role: 'admin',
      });

      await approveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin-status-1',
        requestId: `req_${crypto.randomUUID()}`,
      });

      const received = await receiveReturnRequest({
        returnRequestId: created.request.id,
        actorUserId: 'admin-status-1',
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(received.changed).toBe(true);

      const events = await db
        .select({
          id: shippingEvents.id,
          eventName: shippingEvents.eventName,
          eventSource: shippingEvents.eventSource,
          payload: shippingEvents.payload,
        })
        .from(shippingEvents)
        .where(
          and(
            eq(shippingEvents.orderId, seed.orderId),
            eq(shippingEvents.eventName, 'return_received')
          )
        );

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventName: 'return_received',
        eventSource: 'returns_admin_route',
      });
      expect(events[0]?.payload).toMatchObject({
        returnRequestId: created.request.id,
        restocked: true,
      });

      const firstProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });
      const secondProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(firstProjectorRun.scanned).toBeGreaterThanOrEqual(1);
      expect(secondProjectorRun.scanned).toBeGreaterThanOrEqual(0);

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
          payload: notificationOutbox.payload,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, seed.orderId));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_returned',
        sourceDomain: 'shipping_event',
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'return_received',
        canonicalPayload: {
          returnRequestId: created.request.id,
          restocked: true,
        },
      });

      const sentRow = await runNotificationWorkerUntilSent(seed.orderId);

      expect(sentRow?.status).toBe('sent');
    } finally {
      await cleanupReturnSeed(seed);
      await cleanupUser('admin-status-1');
    }
  }, 30_000);

  it('projects fresh shipped events even when older shipped history is already projected', async () => {
    const projectedOrderId = crypto.randomUUID();
    const freshOrderId = crypto.randomUUID();
    const projectedEventId = crypto.randomUUID();
    const freshEventId = crypto.randomUUID();

    await seedShippableOrder({
      orderId: projectedOrderId,
      userId: null,
      shippingStatus: 'shipped',
      recipientEmail: 'projected-shipped@example.test',
    });
    await seedShippableOrder({
      orderId: freshOrderId,
      userId: null,
      shippingStatus: 'shipped',
      recipientEmail: 'fresh-shipped@example.test',
    });

    try {
      await db.insert(shippingEvents).values([
        {
          id: projectedEventId,
          orderId: projectedOrderId,
          provider: 'nova_poshta',
          eventName: 'shipped',
          eventSource: 'test_projected_history',
          eventRef: `evt_${crypto.randomUUID()}`,
          statusFrom: 'label_created',
          statusTo: 'shipped',
          trackingNumber: '20499900000001',
          payload: {
            paymentStatus: 'paid',
            trackingNumber: '20499900000001',
          },
          dedupeKey: `shipping:${crypto.randomUUID()}`,
          occurredAt: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          id: freshEventId,
          orderId: freshOrderId,
          provider: 'nova_poshta',
          eventName: 'shipped',
          eventSource: 'test_fresh_history',
          eventRef: `evt_${crypto.randomUUID()}`,
          statusFrom: 'label_created',
          statusTo: 'shipped',
          trackingNumber: '20499900000002',
          payload: {
            paymentStatus: 'paid',
            trackingNumber: '20499900000002',
          },
          dedupeKey: `shipping:${crypto.randomUUID()}`,
          occurredAt: new Date('2026-04-02T00:00:00.000Z'),
        },
      ] as any);

      await db.insert(notificationOutbox).values({
        orderId: projectedOrderId,
        channel: 'email',
        templateKey: 'order_shipped',
        sourceDomain: 'shipping_event',
        sourceEventId: projectedEventId,
        payload: {
          canonicalEventName: 'shipped',
        },
        status: 'sent',
        sentAt: new Date(),
        dedupeKey: `outbox:${crypto.randomUUID()}`,
      } as any);

      let rows: Array<{
        templateKey: string;
        sourceDomain: string;
        sourceEventId: string;
        payload: unknown;
      }> = [];

      for (let run = 0; run < 5; run += 1) {
        await runNotificationOutboxProjector({ limit: 100 });

        rows = await db
          .select({
            templateKey: notificationOutbox.templateKey,
            sourceDomain: notificationOutbox.sourceDomain,
            sourceEventId: notificationOutbox.sourceEventId,
            payload: notificationOutbox.payload,
          })
          .from(notificationOutbox)
          .where(
            and(
              eq(notificationOutbox.orderId, freshOrderId),
              eq(notificationOutbox.sourceEventId, freshEventId)
            )
          );

        if (rows.length > 0) {
          break;
        }
      }

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        templateKey: 'order_shipped',
        sourceDomain: 'shipping_event',
        sourceEventId: freshEventId,
      });
      expect(rows[0]?.payload).toMatchObject({
        canonicalEventName: 'shipped',
        canonicalEventSource: 'test_fresh_history',
      });
    } finally {
      await cleanupOrder(projectedOrderId);
      await cleanupOrder(freshOrderId);
    }
  }, 30_000);

  it('does not invent order_canceled notifications when the canonical event is missing', async () => {
    const orderId = crypto.randomUUID();
    await seedShippableOrder({
      orderId,
      userId: null,
      paymentStatus: 'failed',
      status: 'CANCELED',
      inventoryStatus: 'released',
      shippingStatus: 'cancelled',
      recipientEmail: 'guest-replay@example.test',
    });

    await db
      .update(orders)
      .set({
        stockRestored: true,
        restockedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    try {
      const firstProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });
      const secondProjectorRun = await runNotificationOutboxProjector({
        limit: 50,
      });

      expect(firstProjectorRun.scanned).toBeGreaterThanOrEqual(0);
      expect(secondProjectorRun.scanned).toBeGreaterThanOrEqual(0);

      const events = await db
        .select({
          id: paymentEvents.id,
          eventName: paymentEvents.eventName,
        })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.orderId, orderId),
            eq(paymentEvents.eventName, 'order_canceled')
          )
        );

      expect(events).toHaveLength(0);

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
          sourceDomain: notificationOutbox.sourceDomain,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      expect(rows).toHaveLength(0);
    } finally {
      await cleanupOrder(orderId);
    }
  }, 30_000);
});
