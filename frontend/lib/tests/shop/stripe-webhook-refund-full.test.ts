import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/psp/stripe', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/psp/stripe')>(
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
import { orders, shippingShipments, stripeEvents } from '@/db/schema';
import { retrieveCharge, verifyWebhookSignature } from '@/lib/psp/stripe';
import { restockOrder } from '@/lib/services/orders';
import { closeShippingPipelineForOrder } from '@/lib/services/shop/shipping/pipeline-shutdown';
import { claimQueuedShipmentsForProcessing } from '@/lib/services/shop/shipping/shipments-worker';

const verifyWebhookSignatureMock = vi.mocked(verifyWebhookSignature);
const retrieveChargeMock = vi.mocked(retrieveCharge);
const restockOrderMock = vi.mocked(restockOrder);

type Inserted = {
  orderId: string;
  paymentIntentId: string;
  shipmentId: string | null;
};

async function insertPaidOrder(args?: {
  withQueuedShipment?: boolean;
}): Promise<Inserted> {
  const orderId = crypto.randomUUID();
  const paymentIntentId = `pi_test_${crypto.randomUUID()}`;
  const shipmentId = args?.withQueuedShipment ? crypto.randomUUID() : null;

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
    ...(args?.withQueuedShipment
      ? {
          shippingRequired: true,
          shippingPayer: 'customer',
          shippingProvider: 'nova_poshta',
          shippingMethodCode: 'NP_WAREHOUSE',
          shippingAmountMinor: null,
          shippingStatus: 'queued',
        }
      : {}),
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    stockRestored: false,
    pspMetadata: {},
  };

  await db.insert(orders).values(row);
  if (shipmentId) {
    await db.insert(shippingShipments).values({
      id: shipmentId,
      orderId,
      provider: 'nova_poshta',
      status: 'queued',
      attemptCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    } as any);
  }

  return { orderId, paymentIntentId, shipmentId };
}

async function insertPendingOrderWithQueuedShipment(): Promise<Inserted> {
  const orderId = crypto.randomUUID();
  const paymentIntentId = `pi_test_${crypto.randomUUID()}`;
  const shipmentId = crypto.randomUUID();

  const totalAmountMinor = 2500;
  const totalAmount = (totalAmountMinor / 100).toFixed(2);

  await db.insert(orders).values({
    id: orderId,
    userId: null,
    totalAmountMinor,
    totalAmount,
    currency: 'USD',
    paymentStatus: 'pending',
    paymentProvider: 'stripe',
    paymentIntentId,
    status: 'INVENTORY_RESERVED',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: 'queued',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    stockRestored: false,
    pspMetadata: {},
  } as any);

  await db.insert(shippingShipments).values({
    id: shipmentId,
    orderId,
    provider: 'nova_poshta',
    status: 'queued',
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
  } as any);

  return { orderId, paymentIntentId, shipmentId };
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
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, ins.orderId));
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

    restockOrderMock.mockImplementation(async (orderId: string) => {
      await closeShippingPipelineForOrder({
        orderId,
        reason: 'test_restock',
      });

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

  it('full refund (charge.refund.updated) WITHOUT metadata.orderId resolves by paymentIntentId, sets terminal status, calls restock once', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;
    const refundId = `re_${crypto.randomUUID()}`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const expandedCharge = makeCharge({
        chargeId,
        paymentIntentId: inserted.paymentIntentId,
        amount: 2500,
        amountRefunded: 2500,
        refunds: [{ id: refundId, amount: 2500 }],
      });

      const refund = {
        id: refundId,
        object: 'refund',
        amount: 2500,
        status: 'succeeded',
        reason: null,
        charge: expandedCharge,
        payment_intent: inserted.paymentIntentId,
        metadata: {},
      };

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
      expect(row.pspChargeId).toBe(chargeId);

      expect(retrieveChargeMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(restockOrderMock).toHaveBeenCalledTimes(1);
      expect(restockOrderMock).toHaveBeenCalledWith(inserted.orderId, {
        reason: 'refunded',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  }, 30_000);

  it('refund closes queued shipment pipeline and stays idempotent on replay', async () => {
    inserted = await insertPaidOrder({ withQueuedShipment: true });

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;
    const refundId = `re_${crypto.randomUUID()}`;

    const expandedCharge = makeCharge({
      chargeId,
      paymentIntentId: inserted.paymentIntentId,
      amount: 2500,
      amountRefunded: 2500,
      refunds: [{ id: refundId, amount: 2500 }],
    });

    const refund = {
      id: refundId,
      object: 'refund',
      amount: 2500,
      status: 'succeeded',
      reason: null,
      charge: expandedCharge,
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    } as unknown as Stripe.Event);

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);

    const [order1] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        shippingStatus: orders.shippingStatus,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);

    expect(order1?.paymentStatus).toBe('refunded');
    expect(order1?.status).toBe('CANCELED');
    expect(order1?.shippingStatus).toBe('cancelled');

    const [shipment1] = await db
      .select({
        status: shippingShipments.status,
      })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, inserted.shipmentId!))
      .limit(1);
    expect(shipment1?.status).toBe('needs_attention');

    const claimed = await claimQueuedShipmentsForProcessing({
      runId: crypto.randomUUID(),
      leaseSeconds: 120,
      limit: 10,
    });
    expect(claimed).toHaveLength(0);

    const second = await POST(makeRequest());
    expect(second.status).toBe(200);

    const [shipment2] = await db
      .select({
        status: shippingShipments.status,
      })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, inserted.shipmentId!))
      .limit(1);
    expect(shipment2?.status).toBe('needs_attention');
    expect(restockOrderMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('payment_intent.payment_failed closes queued shipment pipeline and is idempotent on replay', async () => {
    inserted = await insertPendingOrderWithQueuedShipment();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: inserted.paymentIntentId,
          object: 'payment_intent',
          status: 'requires_payment_method',
          latest_charge: chargeId,
          cancellation_reason: null,
          last_payment_error: {
            code: 'card_declined',
            decline_code: 'insufficient_funds',
            message: 'Card declined',
          },
          metadata: { orderId: inserted.orderId },
        },
      },
    } as unknown as Stripe.Event);

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);

    const [order1] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        shippingStatus: orders.shippingStatus,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);
    expect(order1?.paymentStatus).toBe('failed');
    expect(order1?.shippingStatus).toBe('cancelled');

    const [shipment1] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, inserted.shipmentId!))
      .limit(1);
    expect(shipment1?.status).toBe('needs_attention');

    const claimed = await claimQueuedShipmentsForProcessing({
      runId: crypto.randomUUID(),
      leaseSeconds: 120,
      limit: 10,
    });
    expect(claimed).toHaveLength(0);

    const second = await POST(makeRequest());
    expect(second.status).toBe(200);

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('payment_intent.canceled closes queued shipment pipeline and is idempotent on replay', async () => {
    inserted = await insertPendingOrderWithQueuedShipment();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'payment_intent.canceled',
      data: {
        object: {
          id: inserted.paymentIntentId,
          object: 'payment_intent',
          status: 'canceled',
          latest_charge: chargeId,
          cancellation_reason: 'abandoned',
          metadata: { orderId: inserted.orderId },
        },
      },
    } as unknown as Stripe.Event);

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);

    const [order1] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        shippingStatus: orders.shippingStatus,
      })
      .from(orders)
      .where(eq(orders.id, inserted.orderId))
      .limit(1);
    expect(order1?.paymentStatus).toBe('failed');
    expect(order1?.shippingStatus).toBe('cancelled');

    const [shipment1] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, inserted.shipmentId!))
      .limit(1);
    expect(shipment1?.status).toBe('needs_attention');

    const claimed = await claimQueuedShipmentsForProcessing({
      runId: crypto.randomUUID(),
      leaseSeconds: 120,
      limit: 10,
    });
    expect(claimed).toHaveLength(0);

    const second = await POST(makeRequest());
    expect(second.status).toBe(200);

    expect(restockOrderMock).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('full refund (charge.refund.updated) must use cumulative refunded (not refund.amount) when full consists of multiple partial refunds', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    try {
      const refund1Id = `re_${crypto.randomUUID()}`;
      const refund2Id = `re_${crypto.randomUUID()}`;
      const refund3Id = `re_${crypto.randomUUID()}`;

      const expandedCharge = makeCharge({
        chargeId,
        paymentIntentId: inserted.paymentIntentId,
        amount: 2500,
        amountRefunded: 2500,
        refunds: [
          { id: refund1Id, amount: 1000 },
          { id: refund2Id, amount: 1000 },
          { id: refund3Id, amount: 500 },
        ],
      });

      const refund = {
        id: refund3Id,
        object: 'refund',
        amount: 500,
        status: 'succeeded',
        reason: null,
        charge: expandedCharge,
        payment_intent: inserted.paymentIntentId,
        metadata: {},
      };

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

      expect(retrieveChargeMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      expect(restockOrderMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  }, 30_000);

  it('charge.refund.updated with refund.charge as string id is gracefully ignored: ack 200, processedAt set, no retrieve/no fetch/no terminal refund/no restock', async () => {
    inserted = await insertPaidOrder();

    const eventId = `evt_${crypto.randomUUID()}`;
    const chargeId = `ch_${crypto.randomUUID()}`;
    const refundId = `re_${crypto.randomUUID()}`;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const refund = {
      id: refundId,
      object: 'refund',
      amount: 2500,
      status: 'succeeded',
      reason: null,
      charge: chargeId,
      payment_intent: inserted.paymentIntentId,
      metadata: {},
    };

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refund.updated',
      data: { object: refund },
    } as unknown as Stripe.Event);

    try {
      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });

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
      expect(evt.processedAt).not.toBeNull();
      expect(evt.paymentIntentId).toBe(inserted.paymentIntentId);

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
      expect(retrieveChargeMock).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(restockOrderMock).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
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
      amountRefunded: 1000,
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
      amountRefunded: 2500,
      refunds: [
        { id: refund1Id, amount: 1000 },
        { id: refund2Id, amount: 1500 },
      ],
    });

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
      amountRefunded: 0,
      refunds: [],
    });

    delete (charge as any).amount_refunded;

    (charge as any).refunds = { object: 'list', data: [] };

    verifyWebhookSignatureMock.mockReturnValue({
      id: eventId,
      type: 'charge.refunded',
      data: { object: charge },
    } as unknown as Stripe.Event);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body).toEqual({ code: 'REFUND_FULLNESS_UNDETERMINED' });

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

    expect(parsed.meta?.reason).toBe(
      'missing_amount_refunded_and_empty_refunds_list'
    );

    warnSpy.mockRestore();
  }, 30_000);
});
