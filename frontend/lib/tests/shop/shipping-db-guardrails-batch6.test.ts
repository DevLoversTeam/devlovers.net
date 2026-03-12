import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orders, shippingShipments } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

async function insertOrder(args: {
  paymentStatus:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'needs_review';
  orderStatus:
    | 'CREATED'
    | 'INVENTORY_RESERVED'
    | 'INVENTORY_FAILED'
    | 'PAID'
    | 'CANCELED';
  inventoryStatus:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  shippingStatus:
    | 'pending'
    | 'queued'
    | 'creating_label'
    | 'label_created'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'needs_attention';
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(orders).values({
    id,
    totalAmountMinor: 1234,
    totalAmount: toDbMoney(1234),
    currency: 'UAH',
    paymentProvider: 'stripe',
    paymentStatus: args.paymentStatus,
    status: args.orderStatus,
    inventoryStatus: args.inventoryStatus,
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args.shippingStatus,
    idempotencyKey: `batch6-${id}`,
  } as any);
  return id;
}

describe.sequential('shipping DB guardrails (batch 6)', () => {
  it('blocks queued shipment rows for non-shippable orders', async () => {
    const orderId = await insertOrder({
      paymentStatus: 'pending',
      orderStatus: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      shippingStatus: 'pending',
    });
    const shipmentId = crypto.randomUUID();

    try {
      let thrown: unknown = null;

      try {
        await db.insert(shippingShipments).values({
          id: shipmentId,
          orderId,
          provider: 'nova_poshta',
          status: 'queued',
          attemptCount: 0,
          nextAttemptAt: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        } as any);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeTruthy();
      const rec = thrown as any;
      const code = rec?.cause?.code ?? rec?.code;
      const constraint = rec?.cause?.constraint ?? rec?.constraint;
      expect(code).toBe('23514');
      expect(constraint).toBe('shipping_shipments_shippable_order_chk');
    } finally {
      await db.delete(shippingShipments).where(eq(shippingShipments.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });

  it('auto-closes order+shipment shipping pipeline when order becomes terminal non-fulfillable', async () => {
    const orderId = await insertOrder({
      paymentStatus: 'paid',
      orderStatus: 'PAID',
      inventoryStatus: 'reserved',
      shippingStatus: 'queued',
    });
    const shipmentId = crypto.randomUUID();

    await db.insert(shippingShipments).values({
      id: shipmentId,
      orderId,
      provider: 'nova_poshta',
      status: 'queued',
      attemptCount: 0,
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    } as any);

    try {
      await db
        .update(orders)
        .set({
          paymentStatus: 'failed',
          status: 'INVENTORY_FAILED',
        } as any)
        .where(eq(orders.id, orderId));

      const [orderRow] = await db
        .select({ shippingStatus: orders.shippingStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.shippingStatus).toBe('cancelled');

      const [shipmentRow] = await db
        .select({ status: shippingShipments.status })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, shipmentId))
        .limit(1);
      expect(shipmentRow?.status).toBe('needs_attention');
    } finally {
      await db.delete(shippingShipments).where(eq(shippingShipments.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });

  it('keeps valid paid queued shipment flow unblocked', async () => {
    const orderId = await insertOrder({
      paymentStatus: 'paid',
      orderStatus: 'PAID',
      inventoryStatus: 'reserved',
      shippingStatus: 'queued',
    });
    const shipmentId = crypto.randomUUID();

    try {
      await db.insert(shippingShipments).values({
        id: shipmentId,
        orderId,
        provider: 'nova_poshta',
        status: 'queued',
        attemptCount: 0,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      } as any);

      const [shipmentRow] = await db
        .select({ status: shippingShipments.status })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, shipmentId))
        .limit(1);
      expect(shipmentRow?.status).toBe('queued');
    } finally {
      await db.delete(shippingShipments).where(eq(shippingShipments.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });

  it('does not overwrite already-delivered orders on terminal payment transitions', async () => {
    const orderId = await insertOrder({
      paymentStatus: 'paid',
      orderStatus: 'PAID',
      inventoryStatus: 'reserved',
      shippingStatus: 'delivered',
    });

    try {
      await db
        .update(orders)
        .set({
          paymentStatus: 'refunded',
          status: 'CANCELED',
        } as any)
        .where(eq(orders.id, orderId));

      const [orderRow] = await db
        .select({ shippingStatus: orders.shippingStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.shippingStatus).toBe('delivered');
    } finally {
      await db.delete(shippingShipments).where(eq(shippingShipments.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
  });
});
