import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { adminAuditLog, orders, shippingShipments } from '@/db/schema';
import { applyShippingAdminAction } from '@/lib/services/shop/shipping/admin-actions';
import { toDbMoney } from '@/lib/shop/money';

type Action = 'mark_shipped' | 'mark_delivered';

type SeedArgs = {
  action: Action;
  shippingStatus: 'label_created' | 'shipped';
  shipmentStatus?:
    | 'queued'
    | 'processing'
    | 'succeeded'
    | 'failed'
    | 'needs_attention';
};

type Seeded = {
  orderId: string;
  shipmentId: string | null;
};

const seededOrderIds = new Set<string>();

async function cleanup(orderId: string) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

afterEach(async () => {
  for (const orderId of seededOrderIds) {
    await cleanup(orderId);
  }
  seededOrderIds.clear();
});

async function seedOrder(args: SeedArgs): Promise<Seeded> {
  const orderId = crypto.randomUUID();
  const shipmentId = args.shipmentStatus ? crypto.randomUUID() : null;
  seededOrderIds.add(orderId);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args.shippingStatus,
    idempotencyKey: `admin-shipping-sync-${orderId}`,
  } as any);

  if (shipmentId) {
    await db.insert(shippingShipments).values({
      id: shipmentId,
      orderId,
      provider: 'nova_poshta',
      status: args.shipmentStatus,
      attemptCount: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    } as any);
  }

  return { orderId, shipmentId };
}

describe.sequential('admin shipping action state sync', () => {
  it('mark_shipped rejects when shipment row is missing', async () => {
    const seed = await seedOrder({
      action: 'mark_shipped',
      shippingStatus: 'label_created',
    });

    await expect(
      applyShippingAdminAction({
        orderId: seed.orderId,
        action: 'mark_shipped',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      })
    ).rejects.toMatchObject({
      name: 'ShippingAdminActionError',
      code: 'SHIPMENT_NOT_FOUND',
      status: 409,
    });

    const [orderRow] = await db
      .select({ shippingStatus: orders.shippingStatus })
      .from(orders)
      .where(eq(orders.id, seed.orderId))
      .limit(1);
    expect(orderRow?.shippingStatus).toBe('label_created');
  });

  it('mark_delivered rejects when shipment row is missing', async () => {
    const seed = await seedOrder({
      action: 'mark_delivered',
      shippingStatus: 'shipped',
    });

    await expect(
      applyShippingAdminAction({
        orderId: seed.orderId,
        action: 'mark_delivered',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      })
    ).rejects.toMatchObject({
      name: 'ShippingAdminActionError',
      code: 'SHIPMENT_NOT_FOUND',
      status: 409,
    });

    const [orderRow] = await db
      .select({ shippingStatus: orders.shippingStatus })
      .from(orders)
      .where(eq(orders.id, seed.orderId))
      .limit(1);
    expect(orderRow?.shippingStatus).toBe('shipped');
  });

  it('mark_shipped rejects when shipment row is not in succeeded state', async () => {
    const seed = await seedOrder({
      action: 'mark_shipped',
      shippingStatus: 'label_created',
      shipmentStatus: 'processing',
    });

    await expect(
      applyShippingAdminAction({
        orderId: seed.orderId,
        action: 'mark_shipped',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      })
    ).rejects.toMatchObject({
      name: 'ShippingAdminActionError',
      code: 'SHIPMENT_STATE_INCOMPATIBLE',
      status: 409,
    });

    const [shipmentRow] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seed.shipmentId!))
      .limit(1);
    expect(shipmentRow?.status).toBe('processing');
  });

  it('mark_delivered rejects when shipment row is not in succeeded state', async () => {
    const seed = await seedOrder({
      action: 'mark_delivered',
      shippingStatus: 'shipped',
      shipmentStatus: 'needs_attention',
    });

    await expect(
      applyShippingAdminAction({
        orderId: seed.orderId,
        action: 'mark_delivered',
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
      })
    ).rejects.toMatchObject({
      name: 'ShippingAdminActionError',
      code: 'SHIPMENT_STATE_INCOMPATIBLE',
      status: 409,
    });

    const [shipmentRow] = await db
      .select({ status: shippingShipments.status })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seed.shipmentId!))
      .limit(1);
    expect(shipmentRow?.status).toBe('needs_attention');
  });

  it('repeated mark_shipped is idempotent when shipment row is valid', async () => {
    const seed = await seedOrder({
      action: 'mark_shipped',
      shippingStatus: 'label_created',
      shipmentStatus: 'succeeded',
    });

    const first = await applyShippingAdminAction({
      orderId: seed.orderId,
      action: 'mark_shipped',
      actorUserId: null,
      requestId: `req_${crypto.randomUUID()}`,
    });
    expect(first.changed).toBe(true);
    expect(first.shippingStatus).toBe('shipped');
    expect(first.shipmentStatus).toBe('succeeded');

    const second = await applyShippingAdminAction({
      orderId: seed.orderId,
      action: 'mark_shipped',
      actorUserId: null,
      requestId: `req_${crypto.randomUUID()}`,
    });
    expect(second.changed).toBe(false);
    expect(second.shippingStatus).toBe('shipped');
    expect(second.shipmentStatus).toBe('succeeded');

    const [orderRow] = await db
      .select({ shippingStatus: orders.shippingStatus })
      .from(orders)
      .where(eq(orders.id, seed.orderId))
      .limit(1);
    expect(orderRow?.shippingStatus).toBe('shipped');
  });

  it('repeated mark_delivered is idempotent when shipment row is valid', async () => {
    const seed = await seedOrder({
      action: 'mark_delivered',
      shippingStatus: 'shipped',
      shipmentStatus: 'succeeded',
    });

    const first = await applyShippingAdminAction({
      orderId: seed.orderId,
      action: 'mark_delivered',
      actorUserId: null,
      requestId: `req_${crypto.randomUUID()}`,
    });
    expect(first.changed).toBe(true);
    expect(first.shippingStatus).toBe('delivered');
    expect(first.shipmentStatus).toBe('succeeded');

    const second = await applyShippingAdminAction({
      orderId: seed.orderId,
      action: 'mark_delivered',
      actorUserId: null,
      requestId: `req_${crypto.randomUUID()}`,
    });
    expect(second.changed).toBe(false);
    expect(second.shippingStatus).toBe('delivered');
    expect(second.shipmentStatus).toBe('succeeded');

    const [orderRow] = await db
      .select({ shippingStatus: orders.shippingStatus })
      .from(orders)
      .where(eq(orders.id, seed.orderId))
      .limit(1);
    expect(orderRow?.shippingStatus).toBe('delivered');
  });
});
