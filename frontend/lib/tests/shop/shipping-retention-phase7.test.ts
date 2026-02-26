import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { orderShipping, orders } from '@/db/schema';
import { anonymizeRetainedOrderShippingSnapshots } from '@/lib/services/shop/shipping/retention';
import { toDbMoney } from '@/lib/shop/money';

type SeededOrder = {
  orderId: string;
};

async function seedOrderWithShipping(args: {
  shippingStatus: 'delivered' | 'cancelled';
  updatedAt: Date;
}): Promise<SeededOrder> {
  const orderId = crypto.randomUUID();
  const totalAmountMinor = 2599;

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor,
    totalAmount: toDbMoney(totalAmountMinor),
    currency: 'UAH',
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `shipping-retention-${orderId}`,
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args.shippingStatus,
    updatedAt: args.updatedAt,
  } as any);

  await db.insert(orderShipping).values({
    orderId,
    shippingAddress: {
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      selection: {
        cityRef: 'settlement-ref-1',
        warehouseRef: 'warehouse-ref-1',
        addressLine1: 'Khreschatyk 1',
      },
      recipient: {
        fullName: 'Ivan Petrenko',
        phone: '+380501112233',
        email: 'ivan@example.com',
        comment: 'Call me',
      },
    },
  });

  return { orderId };
}

async function cleanupSeed(seed: SeededOrder) {
  await db.delete(orderShipping).where(eq(orderShipping.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
}

describe.sequential('shipping retention (phase 7)', () => {
  it('anonymizes PII for old delivered/cancelled orders', async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const seed = await seedOrderWithShipping({
      shippingStatus: 'delivered',
      updatedAt: oldDate,
    });

    try {
      const result = await anonymizeRetainedOrderShippingSnapshots({
        runId: crypto.randomUUID(),
        retentionDays: 30,
        batchSize: 25,
      });

      expect(result.processed).toBe(1);

      const [row] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      const snapshot = (row?.shippingAddress ?? {}) as Record<string, any>;
      expect(snapshot.piiRedacted).toBe(true);
      expect(snapshot?.recipient?.fullName).toBe('[REDACTED]');
      expect(snapshot?.recipient?.phone).toBe('[REDACTED]');
      expect(snapshot?.recipient?.email).toBe('[REDACTED]');
      expect(snapshot?.selection?.cityRef).toBe('settlement-ref-1');
      expect(snapshot?.selection?.warehouseRef).toBe('warehouse-ref-1');
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('keeps snapshot intact when order is newer than retention window', async () => {
    const freshDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const seed = await seedOrderWithShipping({
      shippingStatus: 'cancelled',
      updatedAt: freshDate,
    });

    try {
      const result = await anonymizeRetainedOrderShippingSnapshots({
        runId: crypto.randomUUID(),
        retentionDays: 30,
        batchSize: 25,
      });

      expect(result.processed).toBe(0);

      const [row] = await db
        .select({ shippingAddress: orderShipping.shippingAddress })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      const snapshot = (row?.shippingAddress ?? {}) as Record<string, any>;
      expect(snapshot?.recipient?.fullName).toBe('Ivan Petrenko');
      expect(snapshot?.recipient?.phone).toBe('+380501112233');
      expect(snapshot?.recipient?.email).toBe('ivan@example.com');
      expect(snapshot?.piiRedacted ?? false).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });
});
