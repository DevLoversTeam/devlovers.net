import crypto from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import {
  notificationOutbox,
  orders,
  paymentEvents,
  shippingEvents,
} from '@/db/schema';
import { runNotificationOutboxProjector } from '@/lib/services/shop/notifications/projector';
import { toDbMoney } from '@/lib/shop/money';

async function seedOrder() {
  const orderId = crypto.randomUUID();
  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 2000,
    totalAmount: toDbMoney(2000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'pending',
    status: 'CREATED',
    inventoryStatus: 'none',
    idempotencyKey: `phase3-notify-${orderId}`,
  } as any);
  return orderId;
}

async function cleanupOrder(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

function makeDedupe(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

describe.sequential('notifications projector phase 3', () => {
  it('dedupes projected outbox rows for the same canonical event', async () => {
    const orderId = await seedOrder();
    const canonicalEventId = crypto.randomUUID();
    try {
      await db.insert(shippingEvents).values({
        id: canonicalEventId,
        orderId,
        provider: 'intl_quote',
        eventName: 'quote_offered',
        eventSource: 'test',
        eventRef: `evt_${crypto.randomUUID()}`,
        statusFrom: 'requested',
        statusTo: 'offered',
        trackingNumber: null,
        payload: {},
        dedupeKey: makeDedupe('shipping'),
        occurredAt: new Date(),
      } as any);

      const first = await runNotificationOutboxProjector({ limit: 20 });
      const second = await runNotificationOutboxProjector({ limit: 20 });

      expect(first.inserted).toBeGreaterThanOrEqual(1);
      expect(second.inserted).toBe(0);

      const rows = await db
        .select({
          id: notificationOutbox.id,
          templateKey: notificationOutbox.templateKey,
          sourceEventId: notificationOutbox.sourceEventId,
        })
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.orderId, orderId),
            eq(notificationOutbox.sourceEventId, canonicalEventId)
          )
        );

      expect(rows.length).toBe(1);
      expect(rows[0]?.templateKey).toBe('intl_quote_offered');
    } finally {
      await cleanupOrder(orderId);
    }
  });

  it('covers required INTL/payment/shipment/refund template mapping', async () => {
    const orderId = await seedOrder();
    try {
      const shippingEventNames = [
        'quote_requested',
        'quote_offered',
        'quote_accepted',
        'quote_declined',
        'quote_expired',
        'shipment_created',
      ];
      for (const eventName of shippingEventNames) {
        await db.insert(shippingEvents).values({
          id: crypto.randomUUID(),
          orderId,
          provider: eventName.startsWith('quote_') ? 'intl_quote' : 'nova_poshta',
          eventName,
          eventSource: 'test_mapping',
          eventRef: `evt_${crypto.randomUUID()}`,
          statusFrom: null,
          statusTo: null,
          trackingNumber: null,
          payload: {},
          dedupeKey: makeDedupe('shipping'),
          occurredAt: new Date(),
        } as any);
      }

      await db.insert(paymentEvents).values([
        {
          id: crypto.randomUUID(),
          orderId,
          provider: 'stripe',
          eventName: 'paid_applied',
          eventSource: 'test_mapping',
          eventRef: `evt_${crypto.randomUUID()}`,
          amountMinor: 2000,
          currency: 'USD',
          payload: {},
          dedupeKey: makeDedupe('payment'),
          occurredAt: new Date(),
        } as any,
        {
          id: crypto.randomUUID(),
          orderId,
          provider: 'stripe',
          eventName: 'refund_applied',
          eventSource: 'test_mapping',
          eventRef: `evt_${crypto.randomUUID()}`,
          amountMinor: 2000,
          currency: 'USD',
          payload: {},
          dedupeKey: makeDedupe('payment'),
          occurredAt: new Date(),
        } as any,
      ]);

      const projected = await runNotificationOutboxProjector({ limit: 100 });
      expect(projected.inserted).toBeGreaterThanOrEqual(8);

      const rows = await db
        .select({
          templateKey: notificationOutbox.templateKey,
        })
        .from(notificationOutbox)
        .where(eq(notificationOutbox.orderId, orderId));

      const templateKeys = rows.map(row => row.templateKey);
      expect(templateKeys).toEqual(
        expect.arrayContaining([
          'intl_quote_requested',
          'intl_quote_offered',
          'intl_quote_accepted',
          'intl_quote_declined',
          'intl_quote_expired',
          'payment_confirmed',
          'shipment_created',
          'refund_processed',
        ])
      );
    } finally {
      await cleanupOrder(orderId);
    }
  });
});
