import crypto from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders, stripeEvents } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

async function seedOrder(params: { orderId: string; pi: string }) {
  const now = new Date();
  await db.insert(orders).values({
    id: params.orderId,
    idempotencyKey: `test:${crypto.randomUUID()}`, // required in your schema
    totalAmountMinor: 2500,
    totalAmount: toDbMoney(2500),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid', // mismatch: already "paid"
    paymentIntentId: params.pi,
    status: 'INVENTORY_RESERVED', // mismatch: not "PAID"
    inventoryStatus: 'reserved',
    stockRestored: false,
    restockedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function callWebhook(params: { eventId: string; pi: string; orderId: string }) {
  vi.resetModules();
  vi.doMock('@/lib/psp/stripe', async () => {
    const actual = await vi.importActual<any>('@/lib/psp/stripe');
    return {
      ...actual,
      verifyWebhookSignature: () => ({
        id: params.eventId,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: params.pi,
            amount_received: 2500,
            currency: 'usd',
            status: 'succeeded',
            metadata: { orderId: params.orderId },
            latest_charge: null,
          },
        },
      }),
    };
  });

  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy';

  const { POST } = await import('@/app/api/shop/webhooks/stripe/route');

  return POST(
    new Request('http://localhost/api/shop/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=0,v1=deadbeef' },
      body: JSON.stringify({ id: params.eventId }),
    }) as any
  );
}

async function cleanupByIds(params: { orderId: string; eventId: string }) {
  const { orderId, eventId } = params;

  try {
    await db.delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
  } catch (e) {
    console.error(
      '[test cleanup failed]',
      {
        file: 'stripe-webhook-paid-status-repair.test.ts',
        step: 'delete stripeEvents',
        eventId,
        orderId,
      },
      e
    );
  }

  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (e) {
    console.error(
      '[test cleanup failed]',
      {
        file: 'stripe-webhook-paid-status-repair.test.ts',
        step: 'delete orders',
        eventId,
        orderId,
      },
      e
    );
  }
}

describe('stripe webhook: repair paid status mismatch', () => {
  let lastOrderId: string | null = null;
  let lastEventId: string | null = null;

  afterEach(async () => {
    if (!lastOrderId || !lastEventId) return;
    await cleanupByIds({ orderId: lastOrderId, eventId: lastEventId });
    lastOrderId = null;
    lastEventId = null;
  });

  it(
    'repairs status to PAID when paymentStatus=paid but status!=PAID',
    async () => {
      const orderId = crypto.randomUUID();
      const eventId = `evt_${crypto.randomUUID()}`;
      const pi = `pi_test_repair_${crypto.randomUUID()}`;

      lastOrderId = orderId;
      lastEventId = eventId;

      await seedOrder({ orderId, pi });

      const res = await callWebhook({ eventId, pi, orderId });
      expect(res.status).toBe(200);

      const [row] = await db
        .select({ status: orders.status, paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row!.paymentStatus).toBe('paid');
      expect(row!.status).toBe('PAID');
    },
    30_000
  );

  it(
    'dedupes the same eventId after processedAt is set (second call is no-op)',
    async () => {
      const orderId = crypto.randomUUID();
      const eventId = `evt_${crypto.randomUUID()}`;
      const pi = `pi_test_repair_${crypto.randomUUID()}`;

      lastOrderId = orderId;
      lastEventId = eventId;

      await seedOrder({ orderId, pi });

      const res1 = await callWebhook({ eventId, pi, orderId });
      expect(res1.status).toBe(200);

      const res2 = await callWebhook({ eventId, pi, orderId });
      expect(res2.status).toBe(200);

      const [evt] = await db
        .select({ processedAt: stripeEvents.processedAt })
        .from(stripeEvents)
        .where(eq(stripeEvents.eventId, eventId))
        .limit(1);

      expect(evt?.processedAt).toBeTruthy();

      const [row] = await db
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(row!.status).toBe('PAID');
    },
    30_000
  );
});
