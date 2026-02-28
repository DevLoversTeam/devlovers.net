import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { notificationOutbox, orders } from '@/db/schema';
import {
  claimNotificationOutboxBatch,
  countRunnableNotificationOutboxRows,
  runNotificationOutboxWorker,
} from '@/lib/services/shop/notifications/outbox-worker';
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
    idempotencyKey: `phase3-notify-worker-${orderId}`,
  } as any);
  return orderId;
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function insertOutboxRow(args: {
  orderId: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  status?: 'pending' | 'failed' | 'processing';
  attemptCount?: number;
  nextAttemptAt?: Date;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
}) {
  const id = crypto.randomUUID();
  await db.insert(notificationOutbox).values({
    id,
    orderId: args.orderId,
    channel: 'email',
    templateKey: 'intl_quote_offered',
    sourceDomain: 'shipping_event',
    sourceEventId: crypto.randomUUID(),
    payload: args.payload ?? {},
    status: args.status ?? 'pending',
    attemptCount: args.attemptCount ?? 0,
    maxAttempts: args.maxAttempts ?? 5,
    nextAttemptAt: args.nextAttemptAt ?? new Date(),
    leaseOwner: args.leaseOwner ?? null,
    leaseExpiresAt: args.leaseExpiresAt ?? null,
    dedupeKey: `outbox:${crypto.randomUUID()}`,
  } as any);
  return id;
}

describe.sequential('notifications worker phase 3', () => {
  it('lease contention: two claimers cannot claim the same row', async () => {
    const orderId = await seedOrder();
    try {
      await insertOutboxRow({ orderId });

      const first = await claimNotificationOutboxBatch({
        runId: `notify-worker-a-${crypto.randomUUID()}`,
        limit: 1,
        leaseSeconds: 120,
      });
      const second = await claimNotificationOutboxBatch({
        runId: `notify-worker-b-${crypto.randomUUID()}`,
        limit: 1,
        leaseSeconds: 120,
      });

      expect(first.length).toBe(1);
      expect(second.length).toBe(0);
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('retries transient failures with backoff, then dead-letters after max attempts', async () => {
    const orderId = await seedOrder();
    try {
      const outboxId = await insertOutboxRow({
        orderId,
        payload: {
          testMode: {
            forceFail: true,
            code: 'TEMP_SEND_FAIL',
            transient: true,
            message: 'temporary send failure',
          },
        },
        maxAttempts: 2,
      });

      const runId1 = `notify-worker-${crypto.randomUUID()}`;
      const first = await runNotificationOutboxWorker({
        runId: runId1,
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 2,
        baseBackoffSeconds: 5,
      });

      expect(first.claimed).toBe(1);
      expect(first.retried).toBe(1);
      expect(first.deadLettered).toBe(0);

      const [afterFirst] = await db
        .select({
          status: notificationOutbox.status,
          attemptCount: notificationOutbox.attemptCount,
          nextAttemptAt: notificationOutbox.nextAttemptAt,
          lastErrorCode: notificationOutbox.lastErrorCode,
          deadLetteredAt: notificationOutbox.deadLetteredAt,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId))
        .limit(1);

      expect(afterFirst?.status).toBe('failed');
      expect(afterFirst?.attemptCount).toBe(1);
      expect(afterFirst?.nextAttemptAt).toBeTruthy();
      expect(afterFirst?.lastErrorCode).toBe('TEMP_SEND_FAIL');
      expect(afterFirst?.deadLetteredAt).toBeNull();

      await db
        .update(notificationOutbox)
        .set({
          nextAttemptAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(),
        })
        .where(eq(notificationOutbox.id, outboxId));

      const runId2 = `notify-worker-${crypto.randomUUID()}`;
      const second = await runNotificationOutboxWorker({
        runId: runId2,
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 2,
        baseBackoffSeconds: 5,
      });

      expect(second.claimed).toBe(1);
      expect(second.deadLettered).toBe(1);

      const [afterSecond] = await db
        .select({
          status: notificationOutbox.status,
          attemptCount: notificationOutbox.attemptCount,
          nextAttemptAt: notificationOutbox.nextAttemptAt,
          deadLetteredAt: notificationOutbox.deadLetteredAt,
          leaseOwner: notificationOutbox.leaseOwner,
          leaseExpiresAt: notificationOutbox.leaseExpiresAt,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId))
        .limit(1);

      expect(afterSecond?.status).toBe('dead_letter');
      expect(afterSecond?.attemptCount).toBe(2);
      expect(afterSecond?.deadLetteredAt).toBeTruthy();
      expect(afterSecond?.leaseOwner).toBeNull();
      expect(afterSecond?.leaseExpiresAt).toBeNull();
      expect(afterSecond?.nextAttemptAt).toBeTruthy();
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('reclaims stuck processing rows with expired lease and processes them', async () => {
    const orderId = await seedOrder();
    const expiredLeaseAt = new Date(Date.now() - 60_000);
    try {
      const outboxId = await insertOutboxRow({
        orderId,
        status: 'processing',
        attemptCount: 0,
        nextAttemptAt: new Date(Date.now() - 60_000),
        leaseOwner: 'old-worker',
        leaseExpiresAt: expiredLeaseAt,
        payload: {
          testMode: {
            forceFail: true,
            code: 'TEMP_SEND_FAIL',
            transient: true,
            message: 'temporary send failure',
          },
        },
        maxAttempts: 5,
      });

      const runnableBefore = await countRunnableNotificationOutboxRows();
      expect(runnableBefore).toBeGreaterThanOrEqual(1);

      const runId = `notify-worker-${crypto.randomUUID()}`;
      const result = await runNotificationOutboxWorker({
        runId,
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 5,
      });

      expect(result.claimed).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.retried).toBe(1);

      const [row] = await db
        .select({
          status: notificationOutbox.status,
          attemptCount: notificationOutbox.attemptCount,
          leaseOwner: notificationOutbox.leaseOwner,
          leaseExpiresAt: notificationOutbox.leaseExpiresAt,
          lastErrorCode: notificationOutbox.lastErrorCode,
          nextAttemptAt: notificationOutbox.nextAttemptAt,
          updatedAt: notificationOutbox.updatedAt,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.id, outboxId))
        .limit(1);

      expect(row?.status).toBe('failed');
      expect(row?.attemptCount).toBe(1);
      expect(row?.leaseOwner).toBeNull();
      expect(row?.leaseExpiresAt).toBeNull();
      expect(row?.lastErrorCode).toBe('TEMP_SEND_FAIL');
      expect(row?.updatedAt.getTime()).toBeGreaterThan(expiredLeaseAt.getTime());
      expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
