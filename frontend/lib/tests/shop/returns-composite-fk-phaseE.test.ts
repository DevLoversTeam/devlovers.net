import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orders, returnItems, returnRequests } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

async function createOrder(id: string) {
  await db.insert(orders).values({
    id,
    totalAmountMinor: 0,
    totalAmount: toDbMoney(0),
    currency: 'USD',
    paymentProvider: 'stripe',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
  } as any);
}

describe.sequential('returns composite fk phase E', () => {
  it('rejects mismatched return_items.order_id for referenced return_request_id', async () => {
    const orderA = crypto.randomUUID();
    const orderB = crypto.randomUUID();
    const returnRequestId = crypto.randomUUID();

    await createOrder(orderA);
    await createOrder(orderB);

    await db.insert(returnRequests).values({
      id: returnRequestId,
      orderId: orderA,
      currency: 'USD',
      idempotencyKey: `rr_${crypto.randomUUID()}`,
    } as any);

    try {
      let thrown: unknown = null;

      try {
        await db.insert(returnItems).values({
          id: crypto.randomUUID(),
          returnRequestId,
          orderId: orderB,
          quantity: 1,
          unitPriceMinor: 100,
          lineTotalMinor: 100,
          currency: 'USD',
          idempotencyKey: `ri_${crypto.randomUUID()}`,
        } as any);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeTruthy();

      const rec = thrown as any;
      const code = rec?.cause?.code ?? rec?.code;
      const constraint = rec?.cause?.constraint ?? rec?.constraint;

      // 23503 = foreign_key_violation
      expect(code).toBe('23503');
      expect(constraint).toBe('return_items_return_request_order_fk');
    } finally {
      await db
        .delete(returnItems)
        .where(eq(returnItems.returnRequestId, returnRequestId));
      await db
        .delete(returnRequests)
        .where(eq(returnRequests.id, returnRequestId));
      await db.delete(orders).where(eq(orders.id, orderA));
      await db.delete(orders).where(eq(orders.id, orderB));
    }
  });
});
