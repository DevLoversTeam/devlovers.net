import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { adminAuditLog } from '@/db/schema';
import { writeAdminAudit } from '@/lib/services/shop/events/write-admin-audit';

describe.sequential('admin product audit dedupe phase 5', () => {
  it('inserts one admin_audit_log row for the same dedupe seed', async () => {
    const seed = {
      domain: 'product_admin_action',
      action: 'update',
      requestId: 'req_dedupe_product_update_1',
      productId: '55555555-5555-4555-8555-555555555555',
      toIsActive: true,
      toStock: 10,
    };

    const first = await writeAdminAudit({
      actorUserId: null,
      action: 'product_admin_action.update',
      targetType: 'product',
      targetId: seed.productId,
      requestId: seed.requestId,
      payload: { test: true },
      dedupeSeed: seed,
    });

    const second = await writeAdminAudit({
      actorUserId: null,
      action: 'product_admin_action.update',
      targetType: 'product',
      targetId: seed.productId,
      requestId: seed.requestId,
      payload: { test: true },
      dedupeSeed: seed,
    });

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.dedupeKey).toBe(first.dedupeKey);

    const rows = await db
      .select({
        id: adminAuditLog.id,
        dedupeKey: adminAuditLog.dedupeKey,
        action: adminAuditLog.action,
        targetId: adminAuditLog.targetId,
      })
      .from(adminAuditLog)
      .where(eq(adminAuditLog.dedupeKey, first.dedupeKey));

    expect(rows.length).toBe(1);
    expect(rows[0]?.action).toBe('product_admin_action.update');
    expect(rows[0]?.targetId).toBe(seed.productId);

    await db
      .delete(adminAuditLog)
      .where(eq(adminAuditLog.dedupeKey, first.dedupeKey));
  });
});
