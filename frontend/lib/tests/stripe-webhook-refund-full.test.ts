// frontend/lib/tests/stripe-webhook-refund-full.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/psp/stripe', () => ({
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('@/lib/services/orders', () => ({
  restockOrder: vi.fn(),
}));

import { db } from '@/db';
import { orders, stripeEvents } from '@/db/schema';
import { verifyWebhookSignature } from '@/lib/psp/stripe';
import { restockOrder } from '@/lib/services/orders';
import { POST } from '@/app/api/shop/webhooks/stripe/route';

type Inserted = { orderId: string; paymentIntentId: string };

async function insertPaidOrder(): Promise<Inserted> {
  const orderId = crypto.randomUUID();
  const paymentIntentId = `pi_test_${crypto.randomUUID()}`;

  const totalAmountMinor = 2500;
  const totalAmount = (totalAmountMinor / 100).toFixed(2);

  await db.insert(orders).values({
    id: orderId,
    userId: null,
    totalAmountMinor,
    totalAmount,
    currency: 'USD',
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    paymentIntentId,
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    stockRestored: false,
    pspMetadata: {},
  } as any);

  return { orderId, paymentIntentId };
}

function makeRequest() {
  const req = new NextRequest(
    new Request('http://localhost/api/shop/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': 'test-signature',
      },
      body: JSON.stringify({ any: 'payload' }),
    })
  );
  return req;
}

async function cleanupInserted(ins: Inserted) {
  await db
    .delete(stripeEvents)
    .where(eq(stripeEvents.paymentIntentId, ins.paymentIntentId));
  await db.delete(orders).where(eq(orders.id, ins.orderId));
}

describe('stripe webhook refund (full only): PI fallback + terminal status + dedupe', () => {
  let inserted: Inserted | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();

    // restockOrder mocked: we don't retest inventory ledger here (it is covered by restock tests),
    // we only assert webhook triggers it exactly-once and marks order as restocked.
    (restockOrder as any).mockImplementation(async (orderId: string) => {
      await db
        .update(orders)
        .set({
          stockRestored: true,
          restockedAt: new Date(),
          inventoryStatus: 'released',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
    });
  });

  afterEach(async () => {
    if (inserted) await cleanupInserted(inserted);
    inserted = null;
  });

  it('full refund (charge.refunded) WITHOUT metadata.orderId resolves by paymentIntentId, sets terminal status, calls restock once, and dedupes', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;

    const charge = {
      id: `ch_${crypto.randomUUID()}`,
      object: 'charge',
      payment_intent: inserted.paymentIntentId,
      amount: 2500,
      amount_refunded: 2500,
      status: 'succeeded',
      metadata: {}, // IMPORTANT: no orderId -> PI fallback must resolve
      refunds: {
        object: 'list',
        data: [
          {
            id: `re_${crypto.randomUUID()}`,
            object: 'refund',
            status: 'succeeded',
            reason: null,
            amount: 2500,
          },
        ],
      },
    };

    (verifyWebhookSignature as any).mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    });

    // 1st call
    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1).toEqual({ received: true });

    const [row1] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row1.paymentStatus).toBe('refunded');
    expect(row1.status).toBe('CANCELED'); // terminal status per current enum
    expect(row1.stockRestored).toBe(true);

    expect(restockOrder).toHaveBeenCalledTimes(1);
    expect(restockOrder).toHaveBeenCalledWith(inserted.orderId, {
      reason: 'refunded',
    });

    // 2nd call with SAME event.id -> dedupe => no side effects
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);

    expect(restockOrder).toHaveBeenCalledTimes(1);

    const events = await db
      .select({ eventId: stripeEvents.eventId })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId));

    expect(events.length).toBe(1);
  }, 30_000);

  it('full refund (charge.refund.updated) WITHOUT metadata.orderId resolves by paymentIntentId, sets terminal status, calls restock once', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;

    const refundId = `re_${crypto.randomUUID()}`;

    const refund = {
      id: refundId,
      object: 'refund',
      amount: 2500,
      status: 'succeeded',
      reason: null,
      charge: {
        id: chargeId,
        object: 'charge',
        amount: 2500,
        amount_refunded: 2500,
        refunds: {
          object: 'list',
          data: [
            {
              id: refundId,
              object: 'refund',
              status: 'succeeded',
              reason: null,
              amount: 2500,
            },
          ],
        },
      },
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    (verifyWebhookSignature as any).mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const [row] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
        pspChargeId: orders.pspChargeId,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row.paymentStatus).toBe('refunded');
    expect(row.status).toBe('CANCELED');
    expect(row.stockRestored).toBe(true);
    expect(row.pspChargeId).toBe(chargeId); // requires PATCH 1

    expect(restockOrder).toHaveBeenCalledTimes(1);
    expect(restockOrder).toHaveBeenCalledWith(inserted.orderId, {
      reason: 'refunded',
    });
  }, 30_000);

  it('partial refund is ignored (no paymentStatus/status change, no restock)', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;

    const charge = {
      id: `ch_${crypto.randomUUID()}`,
      object: 'charge',
      payment_intent: inserted.paymentIntentId,
      amount: 2500,
      amount_refunded: 1000, // partial
      status: 'succeeded',
      metadata: {}, // still PI fallback path
      refunds: {
        object: 'list',
        data: [
          {
            id: `re_${crypto.randomUUID()}`,
            object: 'refund',
            status: 'succeeded',
            reason: null,
            amount: 1000,
          },
        ],
      },
    };

    (verifyWebhookSignature as any).mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const [row] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row.paymentStatus).toBe('paid');
    expect(row.status).toBe('PAID');
    expect(row.stockRestored).toBe(false);

    expect(restockOrder).toHaveBeenCalledTimes(0);
  }, 30_000);
  it('retry after 500 must reprocess same event.id until processedAt is set (restock not lost)', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;

    const charge = {
      id: `ch_${crypto.randomUUID()}`,
      object: 'charge',
      payment_intent: inserted.paymentIntentId,
      amount: 2500,
      amount_refunded: 2500,
      status: 'succeeded',
      metadata: {}, // no orderId -> PI fallback
      refunds: { object: 'list', data: [] },
    };

    (verifyWebhookSignature as any).mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    });

    // first call: restock throws => webhook returns 500
    (restockOrder as any)
      .mockImplementationOnce(async () => {
        throw new Error('RESTOCK_FAILED');
      })
      .mockImplementationOnce(async (orderId: string) => {
        await db
          .update(orders)
          .set({
            stockRestored: true,
            restockedAt: new Date(),
            inventoryStatus: 'released',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));
      });

    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(500);

    // same eventId retry: MUST reprocess (processedAt is still NULL) and restock succeeds
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);

    const [row] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row.paymentStatus).toBe('refunded');
    expect(row.status).toBe('CANCELED');
    expect(row.stockRestored).toBe(true);

    const [evt] = await db
      .select({ processedAt: stripeEvents.processedAt })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId))
      .limit(1);

    expect(evt.processedAt).not.toBeNull();
  }, 30_000);
  it('full refund (charge.refund.updated) must use cumulative refunded (not refund.amount) when full consists of multiple partial refunds', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;

    const refund1 = {
      id: `re_${crypto.randomUUID()}`,
      object: 'refund',
      status: 'succeeded',
      reason: null,
      amount: 1000,
    };
    const refund2 = {
      id: `re_${crypto.randomUUID()}`,
      object: 'refund',
      status: 'succeeded',
      reason: null,
      amount: 1000,
    };
    const refund3Id = `re_${crypto.randomUUID()}`;

    // current event refund is only 500 (not full by itself)
    const refund = {
      id: refund3Id,
      object: 'refund',
      amount: 500,
      status: 'succeeded',
      reason: null,
      charge: {
        id: chargeId,
        object: 'charge',
        amount: 2500,
        amount_refunded: 2500, // cumulative full
        refunds: {
          object: 'list',
          data: [refund1, refund2, { ...refund1, id: refund3Id, amount: 500 }],
        },
      },
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    (verifyWebhookSignature as any).mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const [row] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row.paymentStatus).toBe('refunded');
    expect(row.status).toBe('CANCELED');
    expect(row.stockRestored).toBe(true);

    expect(restockOrder).toHaveBeenCalledTimes(1);
  }, 30_000);
});
