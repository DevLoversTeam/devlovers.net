import 'server-only';

import { asc } from 'drizzle-orm';

import { db } from '@/db';
import { notificationOutbox, paymentEvents, shippingEvents } from '@/db/schema';
import { buildNotificationOutboxDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import {
  mapPaymentEventToTemplate,
  mapShippingEventToTemplate,
  SHOP_NOTIFICATION_CHANNEL,
} from '@/lib/services/shop/notifications/templates';

type ShippingCanonicalRow = {
  id: string;
  orderId: string;
  eventName: string;
  eventSource: string;
  eventRef: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

type PaymentCanonicalRow = {
  id: string;
  orderId: string;
  eventName: string;
  eventSource: string;
  eventRef: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

export type NotificationProjectorResult = {
  scanned: number;
  inserted: number;
  insertedFromShippingEvents: number;
  insertedFromPaymentEvents: number;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function buildOutboxDedupeKey(args: {
  templateKey: string;
  channel: string;
  orderId: string;
  canonicalEventId: string;
}): string {
  return buildNotificationOutboxDedupeKey({
    templateKey: args.templateKey,
    channel: args.channel,
    orderId: args.orderId,
    canonicalEventId: args.canonicalEventId,
  });
}

function buildOutboxPayload(args: {
  sourceDomain: 'shipping_event' | 'payment_event';
  canonicalEventId: string;
  canonicalEventName: string;
  canonicalEventSource: string;
  canonicalEventRef: string | null;
  canonicalOccurredAt: Date;
  canonicalPayload: Record<string, unknown>;
}) {
  return {
    sourceDomain: args.sourceDomain,
    canonicalEventId: args.canonicalEventId,
    canonicalEventName: args.canonicalEventName,
    canonicalEventSource: args.canonicalEventSource,
    canonicalEventRef: args.canonicalEventRef,
    canonicalOccurredAt: args.canonicalOccurredAt.toISOString(),
    canonicalPayload: args.canonicalPayload,
  };
}

async function projectShippingEvents(limit: number): Promise<{
  scanned: number;
  inserted: number;
}> {
  if (limit <= 0) return { scanned: 0, inserted: 0 };

  const candidates = (await db
    .select({
      id: shippingEvents.id,
      orderId: shippingEvents.orderId,
      eventName: shippingEvents.eventName,
      eventSource: shippingEvents.eventSource,
      eventRef: shippingEvents.eventRef,
      payload: shippingEvents.payload,
      occurredAt: shippingEvents.occurredAt,
    })
    .from(shippingEvents)
    .orderBy(asc(shippingEvents.occurredAt), asc(shippingEvents.id))
    .limit(limit)) as ShippingCanonicalRow[];

  let inserted = 0;
  for (const event of candidates) {
    const templateKey = mapShippingEventToTemplate(event.eventName);
    if (!templateKey) continue;

    const dedupeKey = buildOutboxDedupeKey({
      templateKey,
      channel: SHOP_NOTIFICATION_CHANNEL,
      orderId: event.orderId,
      canonicalEventId: event.id,
    });

    const insertedRows = await db
      .insert(notificationOutbox)
      .values({
        orderId: event.orderId,
        channel: SHOP_NOTIFICATION_CHANNEL,
        templateKey,
        sourceDomain: 'shipping_event',
        sourceEventId: event.id,
        payload: buildOutboxPayload({
          sourceDomain: 'shipping_event',
          canonicalEventId: event.id,
          canonicalEventName: event.eventName,
          canonicalEventSource: event.eventSource,
          canonicalEventRef: event.eventRef,
          canonicalOccurredAt: event.occurredAt,
          canonicalPayload: asObject(event.payload),
        }),
        status: 'pending',
        nextAttemptAt: new Date(),
        dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: notificationOutbox.id });

    if (insertedRows.length > 0) inserted += 1;
  }

  return {
    scanned: candidates.length,
    inserted,
  };
}

async function projectPaymentEvents(limit: number): Promise<{
  scanned: number;
  inserted: number;
}> {
  if (limit <= 0) return { scanned: 0, inserted: 0 };

  const candidates = (await db
    .select({
      id: paymentEvents.id,
      orderId: paymentEvents.orderId,
      eventName: paymentEvents.eventName,
      eventSource: paymentEvents.eventSource,
      eventRef: paymentEvents.eventRef,
      payload: paymentEvents.payload,
      occurredAt: paymentEvents.occurredAt,
    })
    .from(paymentEvents)
    .orderBy(asc(paymentEvents.occurredAt), asc(paymentEvents.id))
    .limit(limit)) as PaymentCanonicalRow[];

  let inserted = 0;
  for (const event of candidates) {
    const templateKey = mapPaymentEventToTemplate(event.eventName);
    if (!templateKey) continue;

    const dedupeKey = buildOutboxDedupeKey({
      templateKey,
      channel: SHOP_NOTIFICATION_CHANNEL,
      orderId: event.orderId,
      canonicalEventId: event.id,
    });

    const insertedRows = await db
      .insert(notificationOutbox)
      .values({
        orderId: event.orderId,
        channel: SHOP_NOTIFICATION_CHANNEL,
        templateKey,
        sourceDomain: 'payment_event',
        sourceEventId: event.id,
        payload: buildOutboxPayload({
          sourceDomain: 'payment_event',
          canonicalEventId: event.id,
          canonicalEventName: event.eventName,
          canonicalEventSource: event.eventSource,
          canonicalEventRef: event.eventRef,
          canonicalOccurredAt: event.occurredAt,
          canonicalPayload: asObject(event.payload),
        }),
        status: 'pending',
        nextAttemptAt: new Date(),
        dedupeKey,
      })
      .onConflictDoNothing()
      .returning({ id: notificationOutbox.id });

    if (insertedRows.length > 0) inserted += 1;
  }

  return {
    scanned: candidates.length,
    inserted,
  };
}

export async function runNotificationOutboxProjector(args?: {
  limit?: number;
}): Promise<NotificationProjectorResult> {
  const limit = Math.max(1, Math.min(500, Math.floor(args?.limit ?? 100)));
  const shippingLimit = Math.max(1, Math.floor(limit / 2));
  const paymentLimit = Math.max(1, limit - shippingLimit);

  const shipping = await projectShippingEvents(shippingLimit);
  const payment = await projectPaymentEvents(paymentLimit);

  return {
    scanned: shipping.scanned + payment.scanned,
    inserted: shipping.inserted + payment.inserted,
    insertedFromShippingEvents: shipping.inserted,
    insertedFromPaymentEvents: payment.inserted,
  };
}
