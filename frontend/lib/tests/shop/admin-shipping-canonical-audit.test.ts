import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { adminAuditLog, orders } from '@/db/schema';
import { applyShippingAdminAction } from '@/lib/services/shop/shipping/admin-actions';
import { toDbMoney } from '@/lib/shop/money';

async function cleanup(orderId: string) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

describe.sequential('admin shipping action canonical audit', () => {
  it('mark_shipped inserts admin_audit_log row by default', async () => {
    const orderId = crypto.randomUUID();
    const requestId = `req_${crypto.randomUUID()}`;

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
      shippingStatus: 'label_created',
      idempotencyKey: crypto.randomUUID(),
    } as any);

    try {
      const result = await applyShippingAdminAction({
        orderId,
        action: 'mark_shipped',
        actorUserId: null,
        requestId,
      });

      expect(result.changed).toBe(true);
      expect(result.shippingStatus).toBe('shipped');

      const logs = await db
        .select({
          id: adminAuditLog.id,
          action: adminAuditLog.action,
          requestId: adminAuditLog.requestId,
          orderId: adminAuditLog.orderId,
        })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, orderId));

      expect(logs.length).toBe(1);
      expect(logs[0]?.action).toBe('shipping_admin_action.mark_shipped');
      expect(logs[0]?.requestId).toBe(requestId);
      expect(logs[0]?.orderId).toBe(orderId);
    } finally {
      await cleanup(orderId);
    }
  });
});
