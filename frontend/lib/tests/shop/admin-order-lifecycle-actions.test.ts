import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { adminAuditLog, orders, shippingShipments, users } from '@/db/schema';
import { applyAdminOrderLifecycleAction } from '@/lib/services/shop/admin-order-lifecycle';
import { toDbMoney } from '@/lib/shop/money';

const ADMIN_USER_ID = 'admin-1';

async function cleanup(orderId: string) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function ensureAdminUser() {
  await db
    .insert(users)
    .values({
      id: ADMIN_USER_ID,
      email: 'admin-1@example.test',
      role: 'admin',
      name: 'Admin 1',
    })
    .onConflictDoNothing();
}

async function insertOrder(args: {
  orderId: string;
  paymentProvider?: 'stripe' | 'monobank' | 'none';
  paymentStatus?:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'needs_review';
  status?:
    | 'CREATED'
    | 'INVENTORY_RESERVED'
    | 'INVENTORY_FAILED'
    | 'PAID'
    | 'CANCELED';
  inventoryStatus?:
    | 'none'
    | 'reserving'
    | 'reserved'
    | 'release_pending'
    | 'released'
    | 'failed';
  shippingRequired?: boolean;
  shippingProvider?: 'nova_poshta' | 'ukrposhta' | null;
  shippingMethodCode?: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER' | null;
  shippingStatus?:
    | 'pending'
    | 'queued'
    | 'creating_label'
    | 'label_created'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'needs_attention'
    | null;
  pspChargeId?: string | null;
}) {
  await db.insert(orders).values({
    id: args.orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: args.paymentProvider ?? 'stripe',
    paymentStatus: args.paymentStatus ?? 'pending',
    status: args.status ?? 'CREATED',
    inventoryStatus: args.inventoryStatus ?? 'none',
    shippingRequired: args.shippingRequired ?? false,
    shippingPayer: args.shippingRequired ? 'customer' : null,
    shippingProvider: args.shippingProvider ?? null,
    shippingMethodCode: args.shippingMethodCode ?? null,
    shippingAmountMinor: null,
    shippingStatus: args.shippingStatus ?? null,
    pspChargeId: args.pspChargeId ?? null,
    idempotencyKey: crypto.randomUUID(),
  } as any);
}

describe.sequential('admin order lifecycle actions', () => {
  it('eligible order can be confirmed and queued for shipping', async () => {
    const orderId = crypto.randomUUID();
    await ensureAdminUser();

    await insertOrder({
      orderId,
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
      shippingRequired: true,
      shippingProvider: 'nova_poshta',
      shippingMethodCode: 'NP_WAREHOUSE',
      shippingStatus: 'pending',
    });

    try {
      const result = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'confirm',
        actorUserId: ADMIN_USER_ID,
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(result.changed).toBe(true);
      expect(result.status).toBe('PAID');
      expect(result.paymentStatus).toBe('paid');
      expect(result.shippingStatus).toBe('queued');

      const [orderRow] = await db
        .select({
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.status).toBe('PAID');
      expect(orderRow?.paymentStatus).toBe('paid');
      expect(orderRow?.shippingStatus).toBe('queued');

      const [shipment] = await db
        .select({ status: shippingShipments.status })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, orderId))
        .limit(1);
      expect(shipment?.status).toBe('queued');

      const auditRows = await db
        .select({ action: adminAuditLog.action })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, orderId));
      expect(auditRows.map(row => row.action)).toContain(
        'order_admin_action.confirm'
      );
    } finally {
      await cleanup(orderId);
    }
  });

  it('eligible order can be canceled without corrupting repeated attempts', async () => {
    const orderId = crypto.randomUUID();
    await ensureAdminUser();

    await insertOrder({
      orderId,
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
      status: 'CREATED',
      inventoryStatus: 'none',
      shippingRequired: false,
      shippingStatus: null,
    });

    try {
      const first = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'cancel',
        actorUserId: ADMIN_USER_ID,
        requestId: `req_${crypto.randomUUID()}`,
      });
      const second = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'cancel',
        actorUserId: ADMIN_USER_ID,
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);

      const [orderRow] = await db
        .select({
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          inventoryStatus: orders.inventoryStatus,
          stockRestored: orders.stockRestored,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      expect(orderRow?.status).toBe('CANCELED');
      expect(orderRow?.paymentStatus).toBe('failed');
      expect(orderRow?.inventoryStatus).toBe('released');
      expect(orderRow?.stockRestored).toBe(true);

      const auditRows = await db
        .select({ action: adminAuditLog.action })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, orderId));
      expect(
        auditRows.filter(row => row.action === 'order_admin_action.cancel')
      ).toHaveLength(1);
    } finally {
      await cleanup(orderId);
    }
  });

  it('eligible order can be completed and repeated attempts stay safe', async () => {
    const orderId = crypto.randomUUID();
    await ensureAdminUser();

    await insertOrder({
      orderId,
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      status: 'PAID',
      inventoryStatus: 'reserved',
      shippingRequired: true,
      shippingProvider: 'nova_poshta',
      shippingMethodCode: 'NP_WAREHOUSE',
      shippingStatus: 'shipped',
    });

    await db.insert(shippingShipments).values({
      id: crypto.randomUUID(),
      orderId,
      provider: 'nova_poshta',
      status: 'succeeded',
      attemptCount: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    } as any);

    try {
      const first = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'complete',
        actorUserId: ADMIN_USER_ID,
        requestId: `req_${crypto.randomUUID()}`,
      });
      const second = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'complete',
        actorUserId: ADMIN_USER_ID,
        requestId: `req_${crypto.randomUUID()}`,
      });

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);

      const [orderRow] = await db
        .select({ shippingStatus: orders.shippingStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.shippingStatus).toBe('delivered');

      const auditRows = await db
        .select({ action: adminAuditLog.action })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, orderId));
      expect(
        auditRows.filter(row => row.action === 'order_admin_action.complete')
      ).toHaveLength(1);
    } finally {
      await cleanup(orderId);
    }
  });

  it('ineligible transitions fail in a controlled way', async () => {
    const unpaidConfirmOrderId = crypto.randomUUID();
    const paidCancelOrderId = crypto.randomUUID();
    const badCompleteOrderId = crypto.randomUUID();
    await ensureAdminUser();

    await insertOrder({
      orderId: unpaidConfirmOrderId,
      paymentProvider: 'stripe',
      paymentStatus: 'pending',
      status: 'INVENTORY_RESERVED',
      inventoryStatus: 'reserved',
    });
    await insertOrder({
      orderId: paidCancelOrderId,
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      status: 'PAID',
      inventoryStatus: 'reserved',
    });
    await insertOrder({
      orderId: badCompleteOrderId,
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      status: 'PAID',
      inventoryStatus: 'reserved',
      shippingRequired: true,
      shippingProvider: 'nova_poshta',
      shippingMethodCode: 'NP_WAREHOUSE',
      shippingStatus: 'label_created',
    });

    await db.insert(shippingShipments).values({
      id: crypto.randomUUID(),
      orderId: badCompleteOrderId,
      provider: 'nova_poshta',
      status: 'succeeded',
      attemptCount: 1,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
    } as any);

    try {
      await expect(
        applyAdminOrderLifecycleAction({
          orderId: unpaidConfirmOrderId,
          action: 'confirm',
          actorUserId: ADMIN_USER_ID,
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'ORDER_CONFIRM_REQUIRES_PAID_PAYMENT',
        status: 409,
      });

      await expect(
        applyAdminOrderLifecycleAction({
          orderId: paidCancelOrderId,
          action: 'cancel',
          actorUserId: ADMIN_USER_ID,
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'ORDER_CANCEL_REQUIRES_REFUND',
        status: 409,
      });

      await expect(
        applyAdminOrderLifecycleAction({
          orderId: badCompleteOrderId,
          action: 'complete',
          actorUserId: ADMIN_USER_ID,
          requestId: `req_${crypto.randomUUID()}`,
        })
      ).rejects.toMatchObject({
        code: 'ORDER_COMPLETE_NOT_ALLOWED',
        status: 409,
      });
    } finally {
      await cleanup(unpaidConfirmOrderId);
      await cleanup(paidCancelOrderId);
      await cleanup(badCompleteOrderId);
    }
  });
});
