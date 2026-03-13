import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orders, shippingShipments } from '@/db/schema';
import {
  evaluateOrderShippingEligibility,
} from '@/lib/services/shop/shipping/eligibility';
import { claimQueuedShipmentsForProcessing } from '@/lib/services/shop/shipping/shipments-worker';
import { toDbMoney } from '@/lib/shop/money';

type Seeded = {
  orderId: string;
  shipmentId: string;
};

async function seedContainedOrder(): Promise<Seeded> {
  const orderId = crypto.randomUUID();
  const shipmentId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1500,
    totalAmount: toDbMoney(1500),
    currency: 'UAH',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'reserved',
    pspStatusReason: 'REFUND_REQUESTED',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingStatus: 'queued',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
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

  return { orderId, shipmentId };
}

async function cleanup(seed: Seeded) {
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
}

describe.sequential('shipping eligibility refund containment', () => {
  let seeded: Seeded | null = null;

  afterEach(async () => {
    if (seeded) {
      await cleanup(seeded);
      seeded = null;
    }
  });

  it('centrally rejects REFUND_REQUESTED orders as not shippable', async () => {
    const eligibility = evaluateOrderShippingEligibility({
      paymentStatus: 'paid',
      orderStatus: 'PAID',
      inventoryStatus: 'reserved',
      pspStatusReason: 'REFUND_REQUESTED',
    });

    expect(eligibility).toEqual({
      ok: false,
      code: 'REFUND_CONTAINED',
      message: 'Order refund is pending finalization.',
    });
  });

  it('worker claim SQL does not lease contained queued shipments', async () => {
    seeded = await seedContainedOrder();

    const claimed = await claimQueuedShipmentsForProcessing({
      runId: crypto.randomUUID(),
      leaseSeconds: 120,
      limit: 10,
    });

    expect(claimed).toHaveLength(0);

    const [shipmentRow] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seeded.shipmentId))
      .limit(1);
    expect(shipmentRow?.status).toBe('queued');
  });
});
