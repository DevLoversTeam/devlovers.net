import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '@/db';
import { getAdminOrdersPage } from '@/db/queries/shop/admin-orders';
import { orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';
import type { PaymentStatus } from '@/lib/shop/payments';

const seededOrderIds = new Set<string>();

async function cleanup(orderId: string) {
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function seedOrder(args: {
  createdAt: Date;
  paymentStatus: PaymentStatus;
}) {
  const id = crypto.randomUUID();
  seededOrderIds.add(id);

  await db.insert(orders).values({
    id,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: args.paymentStatus,
    idempotencyKey: `admin-orders-filters-${id}`,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  } as typeof orders.$inferInsert);

  return id;
}

describe.sequential('admin orders query filters', () => {
  afterEach(async () => {
    for (const orderId of seededOrderIds) {
      await cleanup(orderId);
    }
    seededOrderIds.clear();
  });

  it('keeps the unfiltered list working', async () => {
    const baseline = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
    });
    const pendingId = await seedOrder({
      createdAt: new Date('2099-03-01T12:00:00.000Z'),
      paymentStatus: 'pending',
    });
    const paidId = await seedOrder({
      createdAt: new Date('2099-03-05T12:00:00.000Z'),
      paymentStatus: 'paid',
    });
    const paidLateMarchId = await seedOrder({
      createdAt: new Date('2099-03-31T23:59:59.000Z'),
      paymentStatus: 'paid',
    });

    const result = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
    });

    expect(result.total).toBe(baseline.total + 3);
    expect(result.items.slice(0, 3).map(item => item.id)).toEqual([
      paidLateMarchId,
      paidId,
      pendingId,
    ]);
  });

  it('applies the status filter in the database query', async () => {
    const baseline = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      status: 'paid',
    });
    await seedOrder({
      createdAt: new Date('2099-04-01T12:00:00.000Z'),
      paymentStatus: 'pending',
    });
    const paidId = await seedOrder({
      createdAt: new Date('2099-04-05T12:00:00.000Z'),
      paymentStatus: 'paid',
    });
    const paidLateMarchId = await seedOrder({
      createdAt: new Date('2099-04-30T23:59:59.000Z'),
      paymentStatus: 'paid',
    });
    await seedOrder({
      createdAt: new Date('2099-05-02T12:00:00.000Z'),
      paymentStatus: 'failed',
    });

    const result = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      status: 'paid',
    });

    expect(result.total).toBe(baseline.total + 2);
    expect(result.items.slice(0, 2).map(item => item.id)).toEqual([
      paidLateMarchId,
      paidId,
    ]);
    expect(result.items.every(item => item.paymentStatus === 'paid')).toBe(
      true
    );
  });

  it('applies dateFrom/dateTo boundaries with inclusive day coverage', async () => {
    const fromBaseline = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      createdAtGte: new Date('2099-05-05T00:00:00.000Z'),
    });
    const toBaseline = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      createdAtLt: new Date('2099-06-01T00:00:00.000Z'),
    });
    const pendingId = await seedOrder({
      createdAt: new Date('2099-05-01T12:00:00.000Z'),
      paymentStatus: 'pending',
    });
    const paidId = await seedOrder({
      createdAt: new Date('2099-05-05T12:00:00.000Z'),
      paymentStatus: 'paid',
    });
    const paidLateMarchId = await seedOrder({
      createdAt: new Date('2099-05-31T23:59:59.000Z'),
      paymentStatus: 'paid',
    });
    const aprilId = await seedOrder({
      createdAt: new Date('2099-06-02T12:00:00.000Z'),
      paymentStatus: 'failed',
    });

    const fromResult = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      createdAtGte: new Date('2099-05-05T00:00:00.000Z'),
    });
    const toResult = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      createdAtLt: new Date('2099-06-01T00:00:00.000Z'),
    });

    expect(fromResult.total).toBe(fromBaseline.total + 3);
    expect(fromResult.items.slice(0, 3).map(item => item.id)).toEqual([
      aprilId,
      paidLateMarchId,
      paidId,
    ]);

    expect(toResult.total).toBe(toBaseline.total + 3);
    expect(toResult.items.slice(0, 3).map(item => item.id)).toEqual([
      paidLateMarchId,
      paidId,
      pendingId,
    ]);
    expect(toResult.items.slice(0, 3).map(item => item.id)).not.toContain(
      aprilId
    );
  });

  it('combines status and date filters together', async () => {
    const baseline = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      status: 'paid',
      createdAtGte: new Date('2099-06-06T00:00:00.000Z'),
      createdAtLt: new Date('2099-07-01T00:00:00.000Z'),
    });
    await seedOrder({
      createdAt: new Date('2099-06-01T12:00:00.000Z'),
      paymentStatus: 'pending',
    });
    await seedOrder({
      createdAt: new Date('2099-06-05T12:00:00.000Z'),
      paymentStatus: 'paid',
    });
    const paidMidMarchId = await seedOrder({
      createdAt: new Date('2099-06-10T12:00:00.000Z'),
      paymentStatus: 'paid',
    });
    const paidLateMarchId = await seedOrder({
      createdAt: new Date('2099-06-30T23:59:59.000Z'),
      paymentStatus: 'paid',
    });
    await seedOrder({
      createdAt: new Date('2099-07-02T12:00:00.000Z'),
      paymentStatus: 'failed',
    });

    const result = await getAdminOrdersPage({
      limit: 200,
      offset: 0,
      status: 'paid',
      createdAtGte: new Date('2099-06-06T00:00:00.000Z'),
      createdAtLt: new Date('2099-07-01T00:00:00.000Z'),
    });

    expect(result.total).toBe(baseline.total + 2);
    expect(result.items.slice(0, 2).map(item => item.id)).toEqual([
      paidLateMarchId,
      paidMidMarchId,
    ]);
  });
});
