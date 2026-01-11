// frontend/lib/tests/stripe-webhook-refund-full.test.ts

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/psp/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/psp/stripe')>(
    '@/lib/psp/stripe'
  );

  return {
    ...actual,
    verifyWebhookSignature: vi.fn(),
    retrieveCharge: vi.fn(),
  };
});

vi.mock('@/lib/services/orders', () => ({
  restockOrder: vi.fn(),
}));

import { POST } from '@/app/api/shop/webhooks/stripe/route';
import { db } from '@/db';
import { orders, stripeEvents } from '@/db/schema';
import { retrieveCharge, verifyWebhookSignature } from '@/lib/psp/stripe';
import { restockOrder } from '@/lib/services/orders';

const verifyWebhookSignatureMock = vi.mocked(verifyWebhookSignature);
const retrieveChargeMock = vi.mocked(retrieveCharge);
const restockOrderMock = vi.mocked(restockOrder);

type Inserted = { orderId: string; paymentIntentId: string };

async function insertPaidOrder(): Promise<Inserted> {
  const orderId = crypto.randomUUID();
  const paymentIntentId = `pi_test_${crypto.randomUUID()}`;

  const totalAmountMinor = 2500;
  const totalAmount = (totalAmountMinor / 100).toFixed(2);

  const row: typeof orders.$inferInsert = {
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
  };

  await db.insert(orders).values(row);

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

function makeCharge(input: {
  chargeId: string;
  paymentIntentId: string;
  amount: number;
  amountRefunded: number;
  refunds?: Array<{
    id: string;
    amount: number;
    status?: string;
    reason?: null;
  }>;
}): Stripe.Charge {
  const refunds = input.refunds ?? [];
  return {
    id: input.chargeId,
    object: 'charge',
    payment_intent: input.paymentIntentId,
    amount: input.amount,
    amount_refunded: input.amountRefunded,
    status: 'succeeded',
    metadata: {},
    refunds: {
      object: 'list',
      data: refunds.map(r => ({
        id: r.id,
        object: 'refund',
        status: r.status ?? 'succeeded',
        reason: r.reason ?? null,
        amount: r.amount,
      })),
    },
  } as unknown as Stripe.Charge;
}

describe('stripe webhook refund (full only): PI fallback + terminal status + dedupe', () => {
  let inserted: Inserted | null = null;

  beforeEach(async () => {
    vi.clearAllMocks();

    // restockOrder mocked: we don't retest inventory ledger here (it is covered by restock tests),
    // we only assert webhook triggers it exactly-once and marks order as restocked.
    restockOrderMock.mockImplementation(async (orderId: string) => {
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

    const chargeId = `ch_${crypto.randomUUID()}`;
    const refundId = `re_${crypto.randomUUID()}`;

    const charge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 2500,
      refunds: [{ id: refundId, amount: 2500 }],
    });

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

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

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
    expect(restockOrderMock).toHaveBeenCalledWith(inserted.orderId, {
      reason: 'refunded',
    });

    // 2nd call with SAME event.id -> dedupe => no side effects
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);

    expect(restockOrderMock).toHaveBeenCalledTimes(1);

    const events = await db
      .select({ eventId: stripeEvents.eventId })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId));

    expect(events.length).toBe(1);
  }, 30_000);

  it('full refund (charge.refund.updated) WITHOUT metadata.orderId resolves by paymentIntentId (via retrieveCharge), sets terminal status, calls restock once', async () => {
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
      charge: chargeId, // IMPORTANT: real Stripe shape is usually string id
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    // Webhook code should retrieve the charge by id to get cumulative refunded, etc.
    retrieveChargeMock.mockResolvedValue(
      makeCharge({
        chargeId,
        paymentIntentId: inserted.paymentIntentId,
        amount: 2500,
        amountRefunded: 2500,
        refunds: [{ id: refundId, amount: 2500 }],
      })
    );

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    } as unknown as Stripe.Event);

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
    expect(row.pspChargeId).toBe(chargeId); // requires PATCH 1 in webhook

    expect(retrieveChargeMock).toHaveBeenCalledTimes(1);
    expect(retrieveChargeMock).toHaveBeenCalledWith(chargeId);

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
    expect(restockOrderMock).toHaveBeenCalledWith(inserted.orderId, {
      reason: 'refunded',
    });
  }, 30_000);

  it('partial refund is ignored (no paymentStatus/status change, no restock)', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;

    const chargeId = `ch_${crypto.randomUUID()}`;
    const refundId = `re_${crypto.randomUUID()}`;

    const charge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 1000, // partial
      refunds: [{ id: refundId, amount: 1000 }],
    });

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

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

    expect(restockOrderMock).toHaveBeenCalledTimes(0);
  }, 30_000);

  it('retry after 500 must reprocess same event.id until processedAt is set (restock not lost)', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;

    const chargeId = `ch_${crypto.randomUUID()}`;

    const charge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 2500,
      refunds: [],
    });

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

    // first call: restock throws => webhook returns 500
    restockOrderMock
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

    const refund1Id = `re_${crypto.randomUUID()}`;
    const refund2Id = `re_${crypto.randomUUID()}`;
    const refund3Id = `re_${crypto.randomUUID()}`;

    // current event refund is only 500 (not full by itself)
    const refund = {
      id: refund3Id,
      object: 'refund',
      amount: 500,
      status: 'succeeded',
      reason: null,
      charge: chargeId, // IMPORTANT: real Stripe shape is usually string id
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    // Charge says cumulative refunded is FULL (2500), but refund.amount is only 500.
    retrieveChargeMock.mockResolvedValue(
      makeCharge({
        chargeId,
        paymentIntentId: inserted.paymentIntentId,
        amount: 2500,
        amountRefunded: 2500,
        refunds: [
          { id: refund1Id, amount: 1000 },
          { id: refund2Id, amount: 1000 },
          { id: refund3Id, amount: 500 },
        ],
      })
    );

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    } as unknown as Stripe.Event);

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

    expect(retrieveChargeMock).toHaveBeenCalledTimes(1);
    expect(retrieveChargeMock).toHaveBeenCalledWith(chargeId);

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
  }, 30_000);
  it('charge.refunded: fallback to sum(refunds) when amount_refunded is missing (still detects full refund)', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;
    const refund1Id = `re_${crypto.randomUUID()}`;
    const refund2Id = `re_${crypto.randomUUID()}`;

    const charge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 2500, // will be deleted to force fallback
      refunds: [
        { id: refund1Id, amount: 1000 },
        { id: refund2Id, amount: 1500 },
      ],
    });

    // force edge-case: Stripe object without amount_refunded
    delete (charge as any).amount_refunded;

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

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

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
    expect(restockOrderMock).toHaveBeenCalledWith(inserted.orderId, {
      reason: 'refunded',
    });
  }, 30_000);
  it('refund fullness undetermined: amount_refunded missing + refunds list empty (no refund object) -> 500, processedAt NULL, no order changes', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;

    const charge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 0, // will be deleted to force "missing"
      refunds: [], // empty list => refund object unavailable (refund == null)
    });

    // Edge-case: Stripe object WITHOUT amount_refunded
    delete (charge as any).amount_refunded;

    // Ensure refunds list is present but empty (covers "refunds.data = []")
    (charge as any).refunds = { object: 'list', data: [] };

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    // If you kept the explicit diagnostic mapping:
    const body = await res.json();
    expect(body).toEqual({ code: 'REFUND_FULLNESS_UNDETERMINED' });

    // stripe_events.processed_at must remain NULL (no ack -> Stripe retries)
    const [evt] = await db
      .select({
        processedAt: stripeEvents.processedAt,
        eventId: stripeEvents.eventId,
        paymentIntentId: stripeEvents.paymentIntentId,
      })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId))
      .limit(1);

    expect(evt).toBeTruthy();
    expect(evt.processedAt).toBeNull();
    expect(evt.paymentIntentId).toBe(inserted.paymentIntentId);

    // Order must NOT change (safe no-op)
    const [row] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        stockRestored: orders.stockRestored,
        inventoryStatus: orders.inventoryStatus,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(row.paymentStatus).toBe('paid');
    expect(row.status).toBe('PAID');
    expect(row.stockRestored).toBe(false);
    expect(row.inventoryStatus).toBe('reserved');

    expect(restockOrderMock).toHaveBeenCalledTimes(0);

    // Optional: assert warning fired (locks observability behavior)
    expect(warnSpy).toHaveBeenCalled();

    const firstArg = warnSpy.mock.calls[0]?.[0];
    expect(typeof firstArg).toBe('string');

    const line = firstArg as string;
    const parsed = JSON.parse(line) as {
      level?: string;
      msg?: string;
      meta?: Record<string, unknown>;
    };

    expect(parsed.level).toBe('warn');
    expect(parsed.msg).toBe('stripe_webhook_refund_fullness_undetermined');

    // (опційно, але корисно: зафіксувати reason)
    expect(parsed.meta?.reason).toBe(
      'missing_amount_refunded_and_empty_refunds_list'
    );

    warnSpy.mockRestore();
  }, 30_000);
});
