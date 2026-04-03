import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WriteAdminAuditArgs } from '@/lib/services/shop/events/write-admin-audit';

const logErrorMock = vi.hoisted(() => vi.fn());
const writeAdminAuditMock = vi.hoisted(() =>
  vi.fn(async (..._call: [WriteAdminAuditArgs, { db?: unknown }?]) => {
    void _call;
    return {
      inserted: true,
      dedupeKey: 'admin_audit:v1:test',
      id: 'audit_row_1',
    };
  })
);

vi.mock('@/lib/logging', async () => {
  const actual = await vi.importActual<any>('@/lib/logging');
  return {
    ...actual,
    logError: (...args: unknown[]) => logErrorMock(...args),
  };
});

vi.mock('@/lib/services/shop/events/write-admin-audit', () => ({
  writeAdminAudit: writeAdminAuditMock,
}));

import { db } from '@/db';
import { adminAuditLog, orders, shippingShipments, users } from '@/db/schema';
import { applyAdminOrderLifecycleAction } from '@/lib/services/shop/admin-order-lifecycle';
import { toDbMoney } from '@/lib/shop/money';

const ADMIN_USER_ID = 'admin_lifecycle_audit_1';
type OrderInsertRow = typeof orders.$inferInsert;

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
      email: 'admin-lifecycle-audit@example.test',
      role: 'admin',
      name: 'Admin Lifecycle Audit',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: 'admin-lifecycle-audit@example.test',
        role: 'admin',
        name: 'Admin Lifecycle Audit',
      },
    });
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
  pspStatusReason?: string | null;
  stockRestored?: boolean;
  restockedAt?: Date | null;
}) {
  const orderRow: OrderInsertRow = {
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
    pspChargeId: null,
    pspStatusReason: args.pspStatusReason ?? null,
    stockRestored: args.stockRestored ?? false,
    restockedAt: args.restockedAt ?? null,
    idempotencyKey: crypto.randomUUID(),
  };

  await db.insert(orders).values(orderRow);
}

describe.sequential('admin order lifecycle audit reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirm keeps the successful lifecycle mutation when audit persistence fails', async () => {
    const orderId = crypto.randomUUID();
    const requestId = `req_${crypto.randomUUID()}`;
    const auditError = new Error('confirm audit failed');
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

    writeAdminAuditMock.mockRejectedValueOnce(auditError);

    try {
      const result = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'confirm',
        actorUserId: ADMIN_USER_ID,
        requestId,
      });

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

      expect(logErrorMock).toHaveBeenCalledWith(
        'admin_order_lifecycle_audit_failed',
        auditError,
        expect.objectContaining({
          orderId,
          requestId,
          action: 'confirm',
          code: 'ADMIN_AUDIT_FAILED',
        })
      );
    } finally {
      await cleanup(orderId);
    }
  });

  it('cancel keeps the successful lifecycle mutation when audit persistence fails', async () => {
    const orderId = crypto.randomUUID();
    const requestId = `req_${crypto.randomUUID()}`;
    const auditError = new Error('cancel audit failed');
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

    writeAdminAuditMock.mockRejectedValueOnce(auditError);

    try {
      const result = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'cancel',
        actorUserId: ADMIN_USER_ID,
        requestId,
      });

      expect(result.status).toBe('CANCELED');
      expect(result.paymentStatus).toBe('failed');

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

      expect(logErrorMock).toHaveBeenCalledWith(
        'admin_order_lifecycle_audit_failed',
        auditError,
        expect.objectContaining({
          orderId,
          requestId,
          action: 'cancel',
          code: 'ADMIN_AUDIT_FAILED',
        })
      );
    } finally {
      await cleanup(orderId);
    }
  });

  it('complete keeps the successful lifecycle mutation when audit persistence fails', async () => {
    const orderId = crypto.randomUUID();
    const requestId = `req_${crypto.randomUUID()}`;
    const auditError = new Error('complete audit failed');
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

    writeAdminAuditMock.mockRejectedValueOnce(auditError);

    try {
      const result = await applyAdminOrderLifecycleAction({
        orderId,
        action: 'complete',
        actorUserId: ADMIN_USER_ID,
        requestId,
      });

      expect(result.status).toBe('PAID');
      expect(result.paymentStatus).toBe('paid');
      expect(result.shippingStatus).toBe('delivered');

      const [orderRow] = await db
        .select({ shippingStatus: orders.shippingStatus })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      expect(orderRow?.shippingStatus).toBe('delivered');

      expect(logErrorMock).toHaveBeenCalledWith(
        'admin_order_lifecycle_audit_failed',
        auditError,
        expect.objectContaining({
          orderId,
          requestId,
          action: 'complete',
          code: 'ADMIN_AUDIT_FAILED',
        })
      );
    } finally {
      await cleanup(orderId);
    }
  });
});
