import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  orders,
  paymentAttempts,
  paymentEvents,
  shippingShipments,
  stripeEvents,
} from '@/db/schema';

vi.mock('@/lib/psp/stripe', async () => {
  const actual =
    await vi.importActual<Record<string, unknown>>('@/lib/psp/stripe');
  return {
    ...actual,
    verifyWebhookSignature: vi.fn(),
    retrieveCharge: vi.fn(),
  };
});

import { POST as webhookPOST } from '@/app/api/shop/webhooks/stripe/route';
import { verifyWebhookSignature } from '@/lib/psp/stripe';

type CleanupRecord = { orderId: string; eventIds: string[] };
type SeedOrderArgs = {
  orderId: string;
  paymentIntentId: string;
  paymentStatus?: 'requires_payment' | 'failed';
  orderStatus?: 'INVENTORY_RESERVED' | 'INVENTORY_FAILED';
  inventoryStatus?: 'reserved' | 'released';
  shippingRequired?: boolean;
  shippingStatus?: 'pending' | 'queued' | null;
  stockRestored?: boolean;
  restockedAt?: Date | null;
  pspStatusReason?: string | null;
  attemptStatus?: 'active' | 'failed' | 'succeeded';
  attemptErrorCode?: string | null;
  attemptErrorMessage?: string | null;
};

function makeWebhookRequest(rawBody: string) {
  return new NextRequest('http://localhost:3000/api/shop/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 't=1,v1=test',
    },
    body: rawBody,
  });
}

function logTestCleanupFailed(meta: Record<string, unknown>, error: unknown) {
  console.error('[test cleanup failed]', {
    file: 'stripe-webhook-replay-correctness.test.ts',
    ...meta,
    error,
  });
}

async function cleanup(params: CleanupRecord) {
  const { orderId, eventIds } = params;

  try {
    await db.delete(paymentEvents).where(eq(paymentEvents.orderId, orderId));
  } catch (error) {
    logTestCleanupFailed({ step: 'delete payment events', orderId }, error);
  }

  if (eventIds.length > 0) {
    try {
      await db
        .delete(stripeEvents)
        .where(inArray(stripeEvents.eventId, eventIds));
    } catch (error) {
      logTestCleanupFailed(
        { step: 'delete stripe events', orderId, eventIds },
        error
      );
    }
  }

  try {
    await db
      .delete(shippingShipments)
      .where(eq(shippingShipments.orderId, orderId));
  } catch (error) {
    logTestCleanupFailed({ step: 'delete shipping shipments', orderId }, error);
  }

  try {
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (error) {
    logTestCleanupFailed({ step: 'delete order', orderId }, error);
  }
}

async function seedOrderWithAttempt(args: SeedOrderArgs) {
  const now = new Date();
  const shippingRequired = args.shippingRequired ?? true;
  const shippingStatus = shippingRequired
    ? (args.shippingStatus ?? 'pending')
    : null;
  const paymentStatus = args.paymentStatus ?? 'requires_payment';
  const orderStatus = args.orderStatus ?? 'INVENTORY_RESERVED';
  const inventoryStatus = args.inventoryStatus ?? 'reserved';
  const stockRestored = args.stockRestored ?? false;
  const attemptStatus = args.attemptStatus ?? 'active';
  const finalizedAt = attemptStatus === 'active' ? null : now;

  await db.insert(orders).values({
    id: args.orderId,
    totalAmountMinor: 900,
    totalAmount: '9.00',
    currency: 'USD',
    shippingRequired,
    shippingPayer: shippingRequired ? 'customer' : null,
    shippingProvider: shippingRequired ? 'nova_poshta' : null,
    shippingMethodCode: shippingRequired ? 'NP_WAREHOUSE' : null,
    shippingAmountMinor: null,
    shippingStatus,
    paymentStatus,
    paymentProvider: 'stripe',
    paymentIntentId: args.paymentIntentId,
    idempotencyKey: `idem_${randomUUID()}`,
    status: orderStatus,
    inventoryStatus,
    stockRestored,
    restockedAt: args.restockedAt ?? null,
    pspStatusReason: args.pspStatusReason ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(paymentAttempts).values({
    orderId: args.orderId,
    provider: 'stripe',
    status: attemptStatus,
    attemptNumber: 1,
    currency: 'USD',
    expectedAmountMinor: 900,
    idempotencyKey: `attempt_${randomUUID()}`,
    providerPaymentIntentId: args.paymentIntentId,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    finalizedAt,
    lastErrorCode: args.attemptErrorCode ?? null,
    lastErrorMessage: args.attemptErrorMessage ?? null,
  });
}

function mockSucceededEvent(args: {
  eventId: string;
  orderId: string;
  paymentIntentId: string;
  chargeId: string;
}) {
  vi.mocked(verifyWebhookSignature).mockReturnValue({
    id: args.eventId,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: args.paymentIntentId,
        object: 'payment_intent',
        amount: 900,
        amount_received: 900,
        currency: 'usd',
        status: 'succeeded',
        metadata: { orderId: args.orderId },
        charges: {
          object: 'list',
          data: [
            {
              id: args.chargeId,
              object: 'charge',
              payment_intent: args.paymentIntentId,
              payment_method_details: {
                type: 'card',
                card: { brand: 'visa', last4: '4242' },
              },
            },
          ],
        },
      },
    },
  } as any);
}

async function readState(
  orderId: string,
  paymentIntentId: string,
  eventIds: string[]
) {
  const [order] = await db
    .select({
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      shippingStatus: orders.shippingStatus,
      pspStatusReason: orders.pspStatusReason,
      pspChargeId: orders.pspChargeId,
      pspMetadata: orders.pspMetadata,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const [attempt] = await db
    .select({
      status: paymentAttempts.status,
      lastErrorCode: paymentAttempts.lastErrorCode,
      lastErrorMessage: paymentAttempts.lastErrorMessage,
      finalizedAt: paymentAttempts.finalizedAt,
    })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.providerPaymentIntentId, paymentIntentId))
    .limit(1);

  const paymentEventRows = await db
    .select({ id: paymentEvents.id, eventRef: paymentEvents.eventRef })
    .from(paymentEvents)
    .where(eq(paymentEvents.orderId, orderId));

  const shipmentRows = await db
    .select({ id: shippingShipments.id })
    .from(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));

  const stripeEventRows =
    eventIds.length > 0
      ? await db
          .select({
            eventId: stripeEvents.eventId,
            processedAt: stripeEvents.processedAt,
            claimExpiresAt: stripeEvents.claimExpiresAt,
          })
          .from(stripeEvents)
          .where(inArray(stripeEvents.eventId, eventIds))
      : [];

  return {
    order,
    attempt,
    paymentEventRows,
    shipmentRows,
    stripeEventRows,
  };
}

describe.sequential('stripe webhook replay correctness', () => {
  const cleanupQueue: CleanupRecord[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    while (cleanupQueue.length > 0) {
      const next = cleanupQueue.pop();
      if (next) await cleanup(next);
    }
  });

  it('dedupes the same Stripe event ID without duplicate success side effects', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const chargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({ orderId, paymentIntentId });
    mockSucceededEvent({ eventId, orderId, paymentIntentId, chargeId });

    const first = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId, attempt: 1 }))
    );
    const second = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId, attempt: 2 }))
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const state = await readState(orderId, paymentIntentId, [eventId]);

    expect(state.order?.paymentStatus).toBe('paid');
    expect(state.order?.status).toBe('PAID');
    expect(state.order?.shippingStatus).toBe('queued');
    expect(state.attempt?.status).toBe('succeeded');
    expect(state.paymentEventRows).toHaveLength(1);
    expect(state.paymentEventRows[0]?.eventRef).toBe(eventId);
    expect(state.shipmentRows).toHaveLength(1);
    expect(state.stripeEventRows).toHaveLength(1);
    expect(state.stripeEventRows[0]?.processedAt).toBeTruthy();
  }, 30_000);

  it('retries safely after a transient failure before the event is marked processed', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const chargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({ orderId, paymentIntentId });
    mockSucceededEvent({ eventId, orderId, paymentIntentId, chargeId });

    const originalExecute = db.execute.bind(db);
    const executeSpy = vi.spyOn(db, 'execute');
    executeSpy
      .mockImplementationOnce((() => {
        throw new Error('TRANSIENT_TEST_DB_FAILURE');
      }) as typeof db.execute)
      .mockImplementation(originalExecute as typeof db.execute);

    try {
      const first = await webhookPOST(
        makeWebhookRequest(JSON.stringify({ id: eventId, attempt: 1 }))
      );

      expect(first.status).toBe(500);
      await expect(first.json()).resolves.toMatchObject({
        error: 'internal_error',
      });

      const afterFirst = await readState(orderId, paymentIntentId, [eventId]);

      expect(afterFirst.order?.paymentStatus).toBe('requires_payment');
      expect(afterFirst.order?.status).toBe('INVENTORY_RESERVED');
      expect(afterFirst.order?.shippingStatus).toBe('pending');
      expect(afterFirst.attempt?.status).toBe('active');
      expect(afterFirst.paymentEventRows).toHaveLength(0);
      expect(afterFirst.shipmentRows).toHaveLength(0);
      expect(afterFirst.stripeEventRows).toHaveLength(1);
      expect(afterFirst.stripeEventRows[0]?.processedAt).toBeNull();
      expect(afterFirst.stripeEventRows[0]?.claimExpiresAt?.getTime()).toBe(0);

      const second = await webhookPOST(
        makeWebhookRequest(JSON.stringify({ id: eventId, attempt: 2 }))
      );

      expect(second.status).toBe(200);

      const afterSecond = await readState(orderId, paymentIntentId, [eventId]);

      expect(afterSecond.order?.paymentStatus).toBe('paid');
      expect(afterSecond.order?.status).toBe('PAID');
      expect(afterSecond.order?.shippingStatus).toBe('queued');
      expect(afterSecond.attempt?.status).toBe('succeeded');
      expect(afterSecond.paymentEventRows).toHaveLength(1);
      expect(afterSecond.shipmentRows).toHaveLength(1);
      expect(afterSecond.stripeEventRows).toHaveLength(1);
      expect(afterSecond.stripeEventRows[0]?.processedAt).toBeTruthy();
    } finally {
      executeSpy.mockRestore();
    }
  }, 30_000);

  it('keeps success replay stable after success was already applied', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const firstEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const replayEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const firstChargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const replayChargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [firstEventId, replayEventId] });

    await seedOrderWithAttempt({ orderId, paymentIntentId });

    mockSucceededEvent({
      eventId: firstEventId,
      orderId,
      paymentIntentId,
      chargeId: firstChargeId,
    });
    const first = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: firstEventId, phase: 'first' }))
    );
    expect(first.status).toBe(200);

    mockSucceededEvent({
      eventId: replayEventId,
      orderId,
      paymentIntentId,
      chargeId: replayChargeId,
    });
    const replay = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: replayEventId, phase: 'replay' }))
    );
    expect(replay.status).toBe(200);

    const state = await readState(orderId, paymentIntentId, [
      firstEventId,
      replayEventId,
    ]);

    expect(state.order?.paymentStatus).toBe('paid');
    expect(state.order?.status).toBe('PAID');
    expect(state.order?.shippingStatus).toBe('queued');
    expect(state.order?.pspChargeId).toBe(firstChargeId);
    expect(state.attempt?.status).toBe('succeeded');
    expect(state.paymentEventRows).toHaveLength(1);
    expect(state.paymentEventRows[0]?.eventRef).toBe(firstEventId);
    expect(state.shipmentRows).toHaveLength(1);
    expect(state.stripeEventRows).toHaveLength(2);
    expect(
      state.stripeEventRows.filter(event => event.processedAt != null)
    ).toHaveLength(2);
  }, 30_000);

  it('keeps replay deterministic after the terminal conflict review path', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const firstEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const replayEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const firstChargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const replayChargeId = `ch_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [firstEventId, replayEventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'failed',
      orderStatus: 'INVENTORY_FAILED',
      inventoryStatus: 'released',
      shippingRequired: false,
      shippingStatus: null,
      stockRestored: true,
      restockedAt: new Date(),
      pspStatusReason: 'card_declined',
      attemptStatus: 'failed',
      attemptErrorCode: 'payment_failed',
      attemptErrorMessage: 'payment_intent.payment_failed',
    });

    mockSucceededEvent({
      eventId: firstEventId,
      orderId,
      paymentIntentId,
      chargeId: firstChargeId,
    });
    const first = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: firstEventId, phase: 'first' }))
    );
    expect(first.status).toBe(200);

    mockSucceededEvent({
      eventId: replayEventId,
      orderId,
      paymentIntentId,
      chargeId: replayChargeId,
    });
    const replay = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: replayEventId, phase: 'replay' }))
    );
    expect(replay.status).toBe(200);

    const state = await readState(orderId, paymentIntentId, [
      firstEventId,
      replayEventId,
    ]);

    expect(state.order?.paymentStatus).toBe('needs_review');
    expect(state.order?.status).toBe('INVENTORY_FAILED');
    expect(state.order?.pspStatusReason).toBe('late_success_after_failed');
    expect(
      (state.order?.pspMetadata as any)?.outOfOrderSuccess?.fromPaymentStatus
    ).toBe('failed');
    expect(state.attempt?.status).toBe('succeeded');
    expect(state.attempt?.lastErrorCode).toBe('TERMINAL_ORDER_STATE_CONFLICT');
    expect(state.paymentEventRows).toHaveLength(0);
    expect(state.shipmentRows).toHaveLength(0);
    expect(state.stripeEventRows).toHaveLength(2);
    expect(
      state.stripeEventRows.filter(event => event.processedAt != null)
    ).toHaveLength(2);
  }, 30_000);
});
