import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { adminAuditLog, orders, shippingShipments } from '@/db/schema';
import { applyShippingAdminAction } from '@/lib/services/shop/shipping/admin-actions';
import { toDbMoney } from '@/lib/shop/money';

type Action = 'retry_label_creation' | 'mark_shipped' | 'mark_delivered';

type SeedArgs = {
  action: Action;
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
};

type Seeded = {
  orderId: string;
  shipmentId: string | null;
  shippingStatus: 'needs_attention' | 'label_created' | 'shipped' | 'cancelled';
  shipmentStatus: 'failed' | 'needs_attention' | null;
};

function defaultStateForAction(
  action: Action
): Pick<Seeded, 'shippingStatus' | 'shipmentStatus'> {
  if (action === 'retry_label_creation') {
    return {
      shippingStatus: 'needs_attention',
      shipmentStatus: 'failed',
    };
  }
  if (action === 'mark_shipped') {
    return {
      shippingStatus: 'label_created',
      shipmentStatus: null,
    };
  }
  return {
    shippingStatus: 'shipped',
    shipmentStatus: null,
  };
}

async function seedOrder(args: SeedArgs): Promise<Seeded> {
  const orderId = crypto.randomUUID();
  const shipmentId = crypto.randomUUID();
  const state = defaultStateForAction(args.action);

  const targetIsShippable =
    args.paymentStatus === 'paid' &&
    args.orderStatus === 'PAID' &&
    args.inventoryStatus === 'reserved';

  const requiresPostInsertBlockedTransition = !targetIsShippable;

  const seedPaymentStatus = requiresPostInsertBlockedTransition
    ? 'paid'
    : args.paymentStatus;

  const seedOrderStatus = requiresPostInsertBlockedTransition
    ? 'PAID'
    : args.orderStatus;

  const seedInventoryStatus = requiresPostInsertBlockedTransition
    ? 'reserved'
    : args.inventoryStatus;

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: seedPaymentStatus,
    status: seedOrderStatus,
    inventoryStatus: seedInventoryStatus,
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: state.shippingStatus,
    idempotencyKey: `admin-shipping-gate-${orderId}`,
  } as any);

  if (state.shipmentStatus) {
    await db.insert(shippingShipments).values({
      id: shipmentId,
      orderId,
      provider: 'nova_poshta',
      status: state.shipmentStatus,
      attemptCount: 1,
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    } as any);
  }

  if (requiresPostInsertBlockedTransition) {
    await db
      .update(orders)
      .set({
        paymentStatus: args.paymentStatus,
        status: args.orderStatus,
        inventoryStatus: args.inventoryStatus,
      } as any)
      .where(eq(orders.id, orderId));
  }

  const [persistedOrderRow] = await db
    .select({
      shippingStatus: orders.shippingStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const [persistedShipmentRow] = state.shipmentStatus
    ? await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, shipmentId))
        .limit(1)
    : [undefined];

  return {
    orderId,
    shipmentId: state.shipmentStatus ? shipmentId : null,
    shippingStatus:
      (persistedOrderRow?.shippingStatus as Seeded['shippingStatus']) ??
      state.shippingStatus,
    shipmentStatus:
      (persistedShipmentRow?.status as Seeded['shipmentStatus']) ??
      state.shipmentStatus,
  };
}

async function cleanup(seed: Seeded) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, seed.orderId));
  if (seed.shipmentId) {
    await db
      .delete(shippingShipments)
      .where(eq(shippingShipments.id, seed.shipmentId));
  }
  await db.delete(orders).where(eq(orders.id, seed.orderId));
}

describe.sequential('admin shipping action payment gate', () => {
  const invalidCases = [
    {
      title: 'payment is pending',
      paymentStatus: 'pending' as const,
      orderStatus: 'PAID' as const,
      inventoryStatus: 'reserved' as const,
    },
    {
      title: 'payment is refunded',
      paymentStatus: 'refunded' as const,
      orderStatus: 'PAID' as const,
      inventoryStatus: 'reserved' as const,
    },
    {
      title: 'order is canceled',
      paymentStatus: 'paid' as const,
      orderStatus: 'CANCELED' as const,
      inventoryStatus: 'reserved' as const,
    },
  ];

  const actions: readonly Action[] = [
    'mark_shipped',
    'mark_delivered',
    'retry_label_creation',
  ];

  for (const action of actions) {
    for (const invalidCase of invalidCases) {
      it(`rejects ${action} when ${invalidCase.title}`, async () => {
        const seed = await seedOrder({
          action,
          paymentStatus: invalidCase.paymentStatus,
          orderStatus: invalidCase.orderStatus,
          inventoryStatus: invalidCase.inventoryStatus,
        });

        try {
          await expect(
            applyShippingAdminAction({
              orderId: seed.orderId,
              action,
              actorUserId: null,
              requestId: `req_${crypto.randomUUID()}`,
            })
          ).rejects.toMatchObject({
            name: 'ShippingAdminActionError',
            code: 'ORDER_NOT_SHIPPABLE',
            status: 409,
          });

          const [orderRow] = await db
            .select({
              shippingStatus: orders.shippingStatus,
            })
            .from(orders)
            .where(eq(orders.id, seed.orderId))
            .limit(1);

          expect(orderRow?.shippingStatus).toBe(seed.shippingStatus);

          if (seed.shipmentId) {
            const [shipmentRow] = await db
              .select({
                status: shippingShipments.status,
              })
              .from(shippingShipments)
              .where(eq(shippingShipments.id, seed.shipmentId))
              .limit(1);

            expect(shipmentRow?.status).toBe(seed.shipmentStatus);
          }

          const logs = await db
            .select({ id: adminAuditLog.id })
            .from(adminAuditLog)
            .where(eq(adminAuditLog.orderId, seed.orderId));
          expect(logs).toHaveLength(0);
        } finally {
          await cleanup(seed);
        }
      });
    }
  }
});
