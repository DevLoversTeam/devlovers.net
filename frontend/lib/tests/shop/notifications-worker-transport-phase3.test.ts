import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendShopNotificationEmailMock = vi.fn();

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
import { notificationOutbox, orderShipping, orders } from '@/db/schema';
import { runNotificationOutboxWorker } from '@/lib/services/shop/notifications/outbox-worker';
import { toDbMoney } from '@/lib/shop/money';

async function seedOrder() {
  const orderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1500,
    totalAmount: toDbMoney(1500),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'pending',
    status: 'CREATED',
    inventoryStatus: 'none',
    idempotencyKey: `phase3-notify-transport-${orderId}`,
  } as any);
  return orderId;
}

async function attachRecipientEmail(orderId: string, email: string) {
  await db.insert(orderShipping).values({
    orderId,
    shippingAddress: {
      recipient: {
        fullName: 'Test Buyer',
        email,
      },
    },
  } as any);
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function insertOutboxRow(orderId: string) {
  const id = crypto.randomUUID();
  await db.insert(notificationOutbox).values({
    id,
    orderId,
    channel: 'email',
    templateKey: 'intl_quote_offered',
    sourceDomain: 'shipping_event',
    sourceEventId: crypto.randomUUID(),
    payload: {
      canonicalEventName: 'quote_offered',
      canonicalEventSource: 'unit_test',
    },
    status: 'pending',
    attemptCount: 0,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    dedupeKey: `outbox:${crypto.randomUUID()}`,
  } as any);
  return id;
}

describe.sequential('notifications worker transport phase 3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks outbox row as sent only when transport succeeds', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-test-1',
    });

    const orderId = await seedOrder();
    try {
      await attachRecipientEmail(orderId, 'buyer@example.test');
      const outboxId = await insertOutboxRow(orderId);

      const result = await runNotificationOutboxWorker({
        runId: `notify-worker-${crypto.randomUUID()}`,
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 5,
      });

      expect(result.claimed).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.retried).toBe(0);
      expect(result.deadLettered).toBe(0);

      const [row] = await db
        .select({
          status: notificationOutbox.status,
          attemptCount: notificationOutbox.attemptCount,
          sentAt: notificationOutbox.sentAt,
          lastErrorCode: notificationOutbox.lastErrorCode,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId))
        .limit(1);

      expect(row?.status).toBe('sent');
      expect(row?.attemptCount).toBe(1);
      expect(row?.sentAt).toBeTruthy();
      expect(row?.lastErrorCode).toBeNull();

      expect(sendShopNotificationEmailMock).toHaveBeenCalledTimes(1);
      expect(sendShopNotificationEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'buyer@example.test',
        })
      );
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('dead-letters immediately when recipient email is missing', async () => {
    sendShopNotificationEmailMock.mockResolvedValue({
      messageId: 'msg-test-2',
    });

    const orderId = await seedOrder();
    try {
      const outboxId = await insertOutboxRow(orderId);

      const result = await runNotificationOutboxWorker({
        runId: `notify-worker-${crypto.randomUUID()}`,
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 5,
      });

      expect(result.claimed).toBe(1);
      expect(result.sent).toBe(0);
      expect(result.retried).toBe(0);
      expect(result.deadLettered).toBe(1);

      const [row] = await db
        .select({
          status: notificationOutbox.status,
          attemptCount: notificationOutbox.attemptCount,
          deadLetteredAt: notificationOutbox.deadLetteredAt,
          lastErrorCode: notificationOutbox.lastErrorCode,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId))
        .limit(1);

      expect(row?.status).toBe('dead_letter');
      expect(row?.attemptCount).toBe(1);
      expect(row?.deadLetteredAt).toBeTruthy();
      expect(row?.lastErrorCode).toBe('NOTIFICATION_RECIPIENT_MISSING');
      expect(sendShopNotificationEmailMock).not.toHaveBeenCalled();
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
