import 'server-only';

import { db } from '@/db';
import { paymentEvents } from '@/db/schema';
import { buildPaymentEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';

export type WritePaymentEventArgs = {
  orderId: string;
  provider: string;
  eventName: string;
  eventSource: string;
  eventRef?: string | null;
  attemptId?: string | null;
  providerPaymentIntentId?: string | null;
  providerChargeId?: string | null;
  amountMinor: number;
  currency: 'USD' | 'UAH';
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  dedupeKey?: string;
  dedupeSeed?: unknown;
};

export async function writePaymentEvent(args: WritePaymentEventArgs): Promise<{
  inserted: boolean;
  dedupeKey: string;
  id: string | null;
}> {
  const dedupeKey =
    args.dedupeKey ??
    buildPaymentEventDedupeKey(
      args.dedupeSeed ?? {
        orderId: args.orderId,
        provider: args.provider,
        eventName: args.eventName,
        eventSource: args.eventSource,
        eventRef: args.eventRef ?? null,
        attemptId: args.attemptId ?? null,
        providerPaymentIntentId: args.providerPaymentIntentId ?? null,
        providerChargeId: args.providerChargeId ?? null,
      }
    );

  const inserted = await db
    .insert(paymentEvents)
    .values({
      orderId: args.orderId,
      provider: args.provider,
      eventName: args.eventName,
      eventSource: args.eventSource,
      eventRef: args.eventRef ?? null,
      attemptId: args.attemptId ?? null,
      providerPaymentIntentId: args.providerPaymentIntentId ?? null,
      providerChargeId: args.providerChargeId ?? null,
      amountMinor: args.amountMinor,
      currency: args.currency,
      payload: args.payload ?? {},
      dedupeKey,
      occurredAt: args.occurredAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  return {
    inserted: inserted.length > 0,
    dedupeKey,
    id: inserted[0]?.id ?? null,
  };
}
