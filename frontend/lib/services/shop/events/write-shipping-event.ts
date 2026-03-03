import 'server-only';

import { db } from '@/db';
import { shippingEvents } from '@/db/schema';
import { buildShippingEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';

export type WriteShippingEventArgs = {
  orderId: string;
  shipmentId?: string | null;
  provider: string;
  eventName: string;
  eventSource: string;
  eventRef?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  trackingNumber?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  dedupeKey?: string;
  dedupeSeed?: unknown;
};

export async function writeShippingEvent(
  args: WriteShippingEventArgs
): Promise<{ inserted: boolean; dedupeKey: string; id: string | null }> {
  const dedupeKey =
    args.dedupeKey ??
    buildShippingEventDedupeKey(
      args.dedupeSeed ?? {
        orderId: args.orderId,
        shipmentId: args.shipmentId ?? null,
        provider: args.provider,
        eventName: args.eventName,
        eventSource: args.eventSource,
        eventRef: args.eventRef ?? null,
        statusFrom: args.statusFrom ?? null,
        statusTo: args.statusTo ?? null,
      }
    );

  const inserted = await db
    .insert(shippingEvents)
    .values({
      orderId: args.orderId,
      shipmentId: args.shipmentId ?? null,
      provider: args.provider,
      eventName: args.eventName,
      eventSource: args.eventSource,
      eventRef: args.eventRef ?? null,
      statusFrom: args.statusFrom ?? null,
      statusTo: args.statusTo ?? null,
      trackingNumber: args.trackingNumber ?? null,
      payload: args.payload ?? {},
      dedupeKey,
      occurredAt: args.occurredAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: shippingEvents.id });

  return {
    inserted: inserted.length > 0,
    dedupeKey,
    id: inserted[0]?.id ?? null,
  };
}
