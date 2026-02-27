import 'server-only';

import { db } from '@/db';
import { adminAuditLog } from '@/db/schema';
import { buildAdminAuditDedupeKey } from '@/lib/services/shop/events/dedupe-key';

export type WriteAdminAuditArgs = {
  orderId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  dedupeKey?: string;
  dedupeSeed?: unknown;
};

export async function writeAdminAudit(
  args: WriteAdminAuditArgs
): Promise<{ inserted: boolean; dedupeKey: string; id: string | null }> {
  const dedupeKey =
    args.dedupeKey ??
    buildAdminAuditDedupeKey(
      args.dedupeSeed ?? {
        orderId: args.orderId ?? null,
        actorUserId: args.actorUserId ?? null,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId,
        requestId: args.requestId ?? null,
      }
    );

  const inserted = await db
    .insert(adminAuditLog)
    .values({
      orderId: args.orderId ?? null,
      actorUserId: args.actorUserId ?? null,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId,
      requestId: args.requestId ?? null,
      payload: args.payload ?? {},
      dedupeKey,
      occurredAt: args.occurredAt ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: adminAuditLog.id });

  return {
    inserted: inserted.length > 0,
    dedupeKey,
    id: inserted[0]?.id ?? null,
  };
}
