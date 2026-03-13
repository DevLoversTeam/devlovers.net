import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/psp/stripe', () => ({
  createRefund: vi.fn(),
}));

import { db } from '@/db';
import { orders, shippingShipments } from '@/db/schema';
import { createRefund } from '@/lib/psp/stripe';
import { refundOrder } from '@/lib/services/orders/refund';
import { toDbMoney } from '@/lib/shop/money';

const createRefundMock = vi.mocked(createRefund);

type SeededOrder = {
  orderId: string;
  shipmentId: string;
};

async function seedStripeOrder(): Promise<SeededOrder> {
  const orderId = crypto.randomUUID();
  const shipmentId = crypto.randomUUID();

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 2500,
    totalAmount: toDbMoney(2500),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    paymentIntentId: `pi_${crypto.randomUUID()}`,
    pspChargeId: `ch_${crypto.randomUUID()}`,
    status: 'PAID',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
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

  return { orderId, shipmentId };
}

async function cleanup(seed: SeededOrder) {
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
}

describe.sequential('admin stripe refund containment', () => {
  let seeded: SeededOrder | null = null;

  beforeEach(() => {
    createRefundMock.mockReset();
  });

  afterEach(async () => {
    if (seeded) {
      await cleanup(seeded);
      seeded = null;
    }
  });

  it('sets REFUND_REQUESTED and closes queued shipment work only after PSP acceptance', async () => {
    seeded = await seedStripeOrder();
    createRefundMock.mockResolvedValue({
      refundId: `re_${crypto.randomUUID()}`,
      status: 'pending',
    });

    const order = await refundOrder(seeded.orderId, {
      requestedBy: 'admin',
    });

    expect(order.id).toBe(seeded.orderId);
    expect(order.paymentStatus).toBe('paid');

    const [shipmentRow] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seeded.shipmentId))
      .limit(1);
    expect(shipmentRow?.status).toBe('needs_attention');

    const [orderRow] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        pspStatusReason: orders.pspStatusReason,
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(orderRow?.paymentStatus).toBe('paid');
    expect(orderRow?.status).toBe('PAID');
    expect(orderRow?.inventoryStatus).toBe('reserved');
    expect(orderRow?.pspStatusReason).toBe('REFUND_REQUESTED');
    expect(orderRow?.stockRestored).toBe(false);
    expect(orderRow?.restockedAt).toBeNull();
    expect(createRefundMock).toHaveBeenCalledTimes(1);
  });

  it('does not apply containment when Stripe refund request is rejected', async () => {
    seeded = await seedStripeOrder();
    createRefundMock.mockRejectedValue(new Error('stripe down'));

    await expect(
      refundOrder(seeded.orderId, { requestedBy: 'admin' })
    ).rejects.toThrow('stripe down');

    const [orderRow] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        pspStatusReason: orders.pspStatusReason,
        shippingStatus: orders.shippingStatus,
        stockRestored: orders.stockRestored,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(orderRow?.paymentStatus).toBe('paid');
    expect(orderRow?.status).toBe('PAID');
    expect(orderRow?.inventoryStatus).toBe('reserved');
    expect(orderRow?.pspStatusReason).toBeNull();
    expect(orderRow?.shippingStatus).toBe('queued');
    expect(orderRow?.stockRestored).toBe(false);

    const [shipmentRow] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seeded.shipmentId))
      .limit(1);
    expect(shipmentRow?.status).toBe('queued');
  });
});
