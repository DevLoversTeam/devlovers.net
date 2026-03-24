import crypto from 'node:crypto';

import { eq, type InferInsertModel } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orders, returnRequests, shippingShipments } from '@/db/schema';
import { setOrderPaymentIntent } from '@/lib/services/orders/payment-intent';
import { toDbMoney } from '@/lib/shop/money';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

type OrderInsert = InferInsertModel<typeof orders>;
type ShipmentInsert = InferInsertModel<typeof shippingShipments>;
type ReturnRequestInsert = InferInsertModel<typeof returnRequests>;

const seededOrderIds = new Set<string>();

async function cleanupOrder(orderId: string) {
  await db.delete(returnRequests).where(eq(returnRequests.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

afterEach(async () => {
  for (const orderId of seededOrderIds) {
    await cleanupOrder(orderId);
  }
  seededOrderIds.clear();
});

beforeEach(() => {
  assertNotProductionDb();
});

async function seedStripeOrder(args: {
  paymentStatus: OrderInsert['paymentStatus'];
  orderStatus: OrderInsert['status'];
  shippingStatus?: OrderInsert['shippingStatus'];
  paymentIntentId?: string | null;
  shipmentStatus?: ShipmentInsert['status'];
  returnStatus?: ReturnRequestInsert['status'];
}) {
  const orderId = crypto.randomUUID();
  seededOrderIds.add(orderId);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: args.paymentStatus,
    paymentIntentId: args.paymentIntentId ?? null,
    status: args.orderStatus,
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingStatus: args.shippingStatus ?? null,
    idempotencyKey: `payment-intent-stage-${orderId}`,
  });

  if (args.shipmentStatus) {
    await db.insert(shippingShipments).values({
      id: crypto.randomUUID(),
      orderId,
      provider: 'nova_poshta',
      status: args.shipmentStatus,
      attemptCount: 1,
    });
  }

  if (args.returnStatus) {
    await db.insert(returnRequests).values({
      id: crypto.randomUUID(),
      orderId,
      userId: null,
      status: args.returnStatus,
      currency: 'USD',
      refundAmountMinor: 0,
      idempotencyKey: `payment-intent-return-${orderId}`,
    });
  }

  return orderId;
}

describe.sequential('payment-intent fulfillment stage summary', () => {
  it('reflects return-only signals in the idempotent branch', async () => {
    const orderId = await seedStripeOrder({
      paymentStatus: 'requires_payment',
      orderStatus: 'CREATED',
      shippingStatus: 'pending',
      paymentIntentId: 'pi_existing_stage',
      returnStatus: 'refunded',
    });

    const summary = await setOrderPaymentIntent({
      orderId,
      paymentIntentId: 'pi_existing_stage',
    });

    expect(summary.paymentIntentId).toBe('pi_existing_stage');
    expect(summary.fulfillmentStage).toBe('returned');
  });

  it('reflects return-only signals after the guarded update branch', async () => {
    const orderId = await seedStripeOrder({
      paymentStatus: 'pending',
      orderStatus: 'CREATED',
      shippingStatus: 'pending',
      returnStatus: 'refunded',
    });

    const summary = await setOrderPaymentIntent({
      orderId,
      paymentIntentId: 'pi_new_stage',
    });

    expect(summary.paymentIntentId).toBe('pi_new_stage');
    expect(summary.paymentStatus).toBe('requires_payment');
    expect(summary.fulfillmentStage).toBe('returned');
  });
});
