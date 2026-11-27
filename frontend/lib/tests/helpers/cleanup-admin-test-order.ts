import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { adminAuditLog, orders, shippingShipments } from '@/db/schema';

export async function cleanupAdminTestOrder(orderId: string): Promise<void> {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}
