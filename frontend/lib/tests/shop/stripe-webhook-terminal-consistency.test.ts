import { randomUUID } from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, paymentAttempts, stripeEvents } from '@/db/schema';
import * as paymentState from '@/lib/services/orders/payment-state';

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
    file: 'stripe-webhook-terminal-consistency.test.ts',
    ...meta,
    error,
  });
}

async function cleanup(params: { orderId: string; eventIds: string[] }) {
  const { orderId, eventIds } = params;

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
    await db.delete(orders).where(eq(orders.id, orderId));
  } catch (error) {
    logTestCleanupFailed({ step: 'delete order', orderId, eventIds }, error);
  }
}

type SeedOrderArgs = {
  orderId: string;
  paymentIntentId: string;
  paymentStatus: 'requires_payment' | 'failed' | 'refunded';
  status: 'INVENTORY_RESERVED' | 'INVENTORY_FAILED' | 'PAID';
  inventoryStatus: 'reserved' | 'released';
  stockRestored: boolean;
  restockedAt?: Date | null;
  pspStatusReason?: string | null;
  attemptStatus?: 'active' | 'failed';
};

async function seedOrderWithAttempt(args: SeedOrderArgs) {
  const now = new Date();

  await db.insert(orders).values({
    id: args.orderId,
    totalAmountMinor: 900,
    totalAmount: '9.00',
    currency: 'USD',
    shippingRequired: false,
    paymentStatus: args.paymentStatus,
    paymentProvider: 'stripe',
    paymentIntentId: args.paymentIntentId,
    idempotencyKey: `idem_${randomUUID()}`,
    status: args.status,
    inventoryStatus: args.inventoryStatus,
    stockRestored: args.stockRestored,
    restockedAt: args.restockedAt ?? null,
    pspStatusReason: args.pspStatusReason ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(paymentAttempts).values({
    orderId: args.orderId,
    provider: 'stripe',
    status: args.attemptStatus ?? 'active',
    attemptNumber: 1,
    currency: 'USD',
    expectedAmountMinor: 900,
    idempotencyKey: `attempt_${randomUUID()}`,
    providerPaymentIntentId: args.paymentIntentId,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    finalizedAt: args.attemptStatus === 'failed' ? now : null,
    lastErrorCode: args.attemptStatus === 'failed' ? 'payment_failed' : null,
    lastErrorMessage:
      args.attemptStatus === 'failed' ? 'payment_intent.payment_failed' : null,
  });
}

function mockSucceededEvent(args: {
  eventId: string;
  orderId: string;
  paymentIntentId: string;
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
        charges: { object: 'list', data: [] },
      },
    },
  } as any);
}

function mockFailedEvent(args: {
  eventId: string;
  orderId: string;
  paymentIntentId: string;
}) {
  vi.mocked(verifyWebhookSignature).mockReturnValue({
    id: args.eventId,
    object: 'event',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: args.paymentIntentId,
        object: 'payment_intent',
        amount: 900,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: { orderId: args.orderId },
        last_payment_error: {
          code: 'card_declined',
          message: 'Card declined',
        },
        charges: { object: 'list', data: [] },
      },
    },
  } as any);
}

async function readOrderAndAttempt(orderId: string, paymentIntentId: string) {
  const [order] = await db
    .select({
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      pspStatusReason: orders.pspStatusReason,
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

  return { order, attempt };
}

async function readStripeEvent(eventId: string) {
  const [event] = await db
    .select({
      eventId: stripeEvents.eventId,
      processedAt: stripeEvents.processedAt,
      claimExpiresAt: stripeEvents.claimExpiresAt,
    })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, eventId))
    .limit(1);

  return event;
}

describe.sequential('stripe webhook terminal-state consistency', () => {
  const cleanupQueue: Array<{ orderId: string; eventIds: string[] }> = [];

  afterEach(async () => {
    vi.restoreAllMocks();

    while (cleanupQueue.length > 0) {
      const next = cleanupQueue.pop();
      if (next) await cleanup(next);
    }
  });

  it('applies normal Stripe success consistently for a payable order', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'requires_payment',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      stockRestored: false,
    });

    mockSucceededEvent({ eventId, orderId, paymentIntentId });

    const response = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId }))
    );

    expect(response.status).toBe(200);

    const { order, attempt } = await readOrderAndAttempt(
      orderId,
      paymentIntentId
    );

    expect(order?.paymentStatus).toBe('paid');
    expect(order?.status).toBe('PAID');
    expect(attempt?.status).toBe('succeeded');
    expect(attempt?.lastErrorCode).toBeNull();
  }, 30_000);

  it('dedupes duplicate Stripe success delivery without extra side effects', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'requires_payment',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      stockRestored: false,
    });

    mockSucceededEvent({ eventId, orderId, paymentIntentId });

    const first = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId, first: true }))
    );
    const second = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId, second: true }))
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const events = await db
      .select({ eventId: stripeEvents.eventId })
      .from(stripeEvents)
      .where(eq(stripeEvents.eventId, eventId));

    const { order, attempt } = await readOrderAndAttempt(
      orderId,
      paymentIntentId
    );

    expect(events).toHaveLength(1);
    expect(order?.paymentStatus).toBe('paid');
    expect(order?.status).toBe('PAID');
    expect(attempt?.status).toBe('succeeded');
  }, 30_000);

  it('routes late Stripe success after a terminal failed order into explicit review', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'failed',
      status: 'INVENTORY_FAILED',
      inventoryStatus: 'released',
      stockRestored: true,
      restockedAt: new Date(),
      attemptStatus: 'failed',
      pspStatusReason: 'card_declined',
    });

    mockSucceededEvent({ eventId, orderId, paymentIntentId });

    const response = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId }))
    );

    expect(response.status).toBe(200);

    const { order, attempt } = await readOrderAndAttempt(
      orderId,
      paymentIntentId
    );

    expect(order?.paymentStatus).toBe('needs_review');
    expect(order?.status).toBe('INVENTORY_FAILED');
    expect(order?.pspStatusReason).toBe('late_success_after_failed');
    expect(
      (order?.pspMetadata as any)?.outOfOrderSuccess?.fromPaymentStatus
    ).toBe('failed');
    expect(attempt?.status).toBe('succeeded');
    expect(attempt?.lastErrorCode).toBe('TERMINAL_ORDER_STATE_CONFLICT');
    expect(attempt?.lastErrorMessage).toBe(
      'payment_intent.succeeded_after_failed'
    );
  }, 30_000);

  it('routes late Stripe success after a terminal refunded order into explicit review', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'refunded',
      status: 'PAID',
      inventoryStatus: 'released',
      stockRestored: true,
      restockedAt: new Date(),
      attemptStatus: 'failed',
      pspStatusReason: 'requested_by_customer',
    });

    mockSucceededEvent({ eventId, orderId, paymentIntentId });

    const response = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId }))
    );

    expect(response.status).toBe(200);

    const { order, attempt } = await readOrderAndAttempt(
      orderId,
      paymentIntentId
    );

    expect(order?.paymentStatus).toBe('needs_review');
    expect(order?.status).toBe('PAID');
    expect(order?.pspStatusReason).toBe('late_success_after_refunded');
    expect(
      (order?.pspMetadata as any)?.outOfOrderSuccess?.fromPaymentStatus
    ).toBe('refunded');
    expect(attempt?.status).toBe('succeeded');
    expect(attempt?.lastErrorCode).toBe('TERMINAL_ORDER_STATE_CONFLICT');
    expect(attempt?.lastErrorMessage).toBe(
      'payment_intent.succeeded_after_refunded'
    );
  }, 30_000);

  it('blocked conflict releases claim and allows retry', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [eventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'failed',
      status: 'INVENTORY_FAILED',
      inventoryStatus: 'released',
      stockRestored: true,
      restockedAt: new Date(),
      attemptStatus: 'failed',
      pspStatusReason: 'card_declined',
    });

    const transitionSpy = vi
      .spyOn(paymentState, 'guardedPaymentStatusUpdate')
      .mockResolvedValue({
        applied: false,
        reason: 'BLOCKED',
        from: 'failed',
        currentProvider: 'stripe',
      });

    mockSucceededEvent({ eventId, orderId, paymentIntentId });

    const firstResponse = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId }))
    );

    expect(firstResponse.status).toBe(503);
    await expect(firstResponse.json()).resolves.toMatchObject({
      code: 'TERMINAL_SUCCESS_CONFLICT_BLOCKED',
      retryAfterSeconds: 10,
    });

    expect(transitionSpy).toHaveBeenCalledTimes(1);

    const { order, attempt } = await readOrderAndAttempt(
      orderId,
      paymentIntentId
    );
    const eventRowAfterFirst = await readStripeEvent(eventId);

    expect(order?.paymentStatus).toBe('failed');
    expect(order?.status).toBe('INVENTORY_FAILED');
    expect(attempt?.status).toBe('failed');
    expect(attempt?.lastErrorCode).toBe('payment_failed');
    expect(attempt?.lastErrorMessage).toBe('payment_intent.payment_failed');
    expect(eventRowAfterFirst?.processedAt).toBeNull();
    expect(eventRowAfterFirst?.claimExpiresAt?.getTime()).toBe(0);

    const secondResponse = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: eventId, replay: true }))
    );

    expect(secondResponse.status).toBe(503);
    await expect(secondResponse.json()).resolves.toMatchObject({
      code: 'TERMINAL_SUCCESS_CONFLICT_BLOCKED',
      retryAfterSeconds: 10,
    });

    expect(transitionSpy).toHaveBeenCalledTimes(2);

    const eventRowAfterSecond = await readStripeEvent(eventId);
    expect(eventRowAfterSecond?.processedAt).toBeNull();
    expect(eventRowAfterSecond?.claimExpiresAt?.getTime()).toBe(0);
  }, 30_000);

  it('handles out-of-order Stripe failure then success deterministically', async () => {
    const orderId = randomUUID();
    const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const failedEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const successEventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

    cleanupQueue.push({ orderId, eventIds: [failedEventId, successEventId] });

    await seedOrderWithAttempt({
      orderId,
      paymentIntentId,
      paymentStatus: 'requires_payment',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      stockRestored: false,
    });

    mockFailedEvent({ eventId: failedEventId, orderId, paymentIntentId });
    const failedResponse = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: failedEventId }))
    );

    expect(failedResponse.status).toBe(200);

    const afterFailure = await readOrderAndAttempt(orderId, paymentIntentId);
    expect(afterFailure.order?.paymentStatus).toBe('failed');
    expect(afterFailure.attempt?.status).toBe('failed');

    mockSucceededEvent({
      eventId: successEventId,
      orderId,
      paymentIntentId,
    });
    const successResponse = await webhookPOST(
      makeWebhookRequest(JSON.stringify({ id: successEventId }))
    );

    expect(successResponse.status).toBe(200);

    const finalState = await readOrderAndAttempt(orderId, paymentIntentId);

    expect(finalState.order?.paymentStatus).toBe('needs_review');
    expect(finalState.order?.status).toBe('INVENTORY_FAILED');
    expect(finalState.order?.pspStatusReason).toBe('late_success_after_failed');
    expect(finalState.attempt?.status).toBe('succeeded');
    expect(finalState.attempt?.lastErrorCode).toBe(
      'TERMINAL_ORDER_STATE_CONFLICT'
    );
  }, 30_000);
});
