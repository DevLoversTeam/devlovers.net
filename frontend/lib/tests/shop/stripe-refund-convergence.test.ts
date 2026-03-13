import crypto from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/psp/stripe', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/psp/stripe')>(
      '@/lib/psp/stripe'
    );

  return {
    ...actual,
    createRefund: vi.fn(),
    retrieveRefund: vi.fn(),
  };
});

import { db } from '@/db';
import { orders, products, shippingShipments } from '@/db/schema';
import { createRefund, retrieveRefund } from '@/lib/psp/stripe';
import { applyReserveMove } from '@/lib/services/inventory';
import {
  reconcileStaleStripeRefundOrders,
  reconcileStripeRefundOrder,
} from '@/lib/services/orders';
import { refundOrder } from '@/lib/services/orders/refund';
import { toDbMoney } from '@/lib/shop/money';

const createRefundMock = vi.mocked(createRefund);
const retrieveRefundMock = vi.mocked(retrieveRefund);

type SeededOrder = {
  orderId: string;
  productId: string;
  shipmentId: string;
  paymentIntentId: string;
  chargeId: string;
  refundId: string;
  initialStock: number;
  reservedQty: number;
};

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const maybe = res as { rows?: unknown };
  return Array.isArray(maybe?.rows) ? (maybe.rows as T[]) : [];
}

async function countMoveKey(moveKey: string): Promise<number> {
  const res = await db.execute(
    sql`select count(*)::int as n from inventory_moves where move_key = ${moveKey}`
  );
  return Number(readRows<{ n?: number }>(res)[0]?.n ?? 0);
}

async function seedContainedStripeOrder(): Promise<SeededOrder> {
  const orderId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const shipmentId = crypto.randomUUID();
  const paymentIntentId = `pi_${crypto.randomUUID()}`;
  const chargeId = `ch_${crypto.randomUUID()}`;
  const refundId = `re_${crypto.randomUUID()}`;
  const initialStock = 5;
  const reservedQty = 2;

  await db.insert(products).values({
    id: productId,
    title: 'Stripe Refund Product',
    slug: `stripe-refund-${crypto.randomUUID()}`,
    sku: `stripe-refund-${crypto.randomUUID().slice(0, 8)}`,
    badge: 'NONE',
    imageUrl: 'https://example.com/stripe-refund.png',
    isActive: true,
    stock: initialStock,
    price: toDbMoney(2500),
    currency: 'USD',
  } as any);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 2500,
    totalAmount: toDbMoney(2500),
    currency: 'USD',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    paymentIntentId,
    pspChargeId: chargeId,
    status: 'PAID',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingStatus: 'queued',
    idempotencyKey: `idem_${crypto.randomUUID()}`,
    stockRestored: false,
    pspMetadata: {},
  } as any);

  await db.insert(shippingShipments).values({
    id: shipmentId,
    orderId,
    provider: 'nova_poshta',
    status: 'queued',
    attemptCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
  } as any);

  const reserve = await applyReserveMove(orderId, productId, reservedQty);
  expect(reserve.ok).toBe(true);

  createRefundMock.mockResolvedValueOnce({
    refundId,
    status: 'pending',
  });

  await refundOrder(orderId, { requestedBy: 'admin' });

  const [containedOrder] = await db
    .select({
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      inventoryStatus: orders.inventoryStatus,
      pspStatusReason: orders.pspStatusReason,
      shippingStatus: orders.shippingStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  expect(containedOrder?.paymentStatus).toBe('paid');
  expect(containedOrder?.status).toBe('PAID');
  expect(containedOrder?.inventoryStatus).toBe('reserved');
  expect(containedOrder?.pspStatusReason).toBe('REFUND_REQUESTED');
  expect(containedOrder?.shippingStatus).toBe('cancelled');

  const [containedShipment] = await db
    .select({ status: shippingShipments.status })
    .from(shippingShipments)
    .where(eq(shippingShipments.id, shipmentId))
    .limit(1);
  expect(containedShipment?.status).toBe('needs_attention');

  return {
    orderId,
    productId,
    shipmentId,
    paymentIntentId,
    chargeId,
    refundId,
    initialStock,
    reservedQty,
  };
}

async function cleanup(seed: SeededOrder | null) {
  if (!seed) return;
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(products).where(eq(products.id, seed.productId));
}

describe.sequential('stripe refund convergence and recovery', () => {
  let seeded: SeededOrder | null = null;

  beforeEach(() => {
    createRefundMock.mockReset();
    retrieveRefundMock.mockReset();
  });

  afterEach(async () => {
    await cleanup(seeded);
    seeded = null;
  });

  it('reconciles a contained Stripe refund to terminal refunded state exactly once', async () => {
    seeded = await seedContainedStripeOrder();

    retrieveRefundMock.mockResolvedValue({
      refundId: seeded.refundId,
      status: 'succeeded',
      reason: 'requested_by_customer',
      chargeId: seeded.chargeId,
      paymentIntentId: seeded.paymentIntentId,
    });

    const first = await reconcileStripeRefundOrder({
      orderId: seeded.orderId,
    });
    expect(first).toBe('finalized_success');

    const [afterFirst] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
        pspStatusReason: orders.pspStatusReason,
        shippingStatus: orders.shippingStatus,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(afterFirst?.paymentStatus).toBe('refunded');
    expect(afterFirst?.status).toBe('CANCELED');
    expect(afterFirst?.inventoryStatus).toBe('released');
    expect(afterFirst?.stockRestored).toBe(true);
    expect(afterFirst?.restockedAt).not.toBeNull();
    expect(afterFirst?.pspStatusReason).toBe('requested_by_customer');
    expect(afterFirst?.pspStatusReason).not.toBe('REFUND_REQUESTED');
    expect(afterFirst?.shippingStatus).toBe('cancelled');

    const [productAfterFirst] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);
    expect(productAfterFirst?.stock).toBe(seeded.initialStock);

    const releaseKey = `release:${seeded.orderId}:${seeded.productId}`;
    const firstRestockedAt = afterFirst?.restockedAt?.getTime();
    expect(await countMoveKey(releaseKey)).toBe(1);

    const second = await reconcileStripeRefundOrder({
      orderId: seeded.orderId,
    });
    expect(['finalized_success', 'noop']).toContain(second);

    const [afterSecond] = await db
      .select({
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(afterSecond?.stockRestored).toBe(true);
    expect(afterSecond?.restockedAt?.getTime()).toBe(firstRestockedAt);
    expect(await countMoveKey(releaseKey)).toBe(1);
  });

  it('restores a contained Stripe refund failure back to paid and shippable truth without restock', async () => {
    seeded = await seedContainedStripeOrder();

    retrieveRefundMock.mockResolvedValue({
      refundId: seeded.refundId,
      status: 'canceled',
      reason: 'expired_uncaptured_charge',
      chargeId: seeded.chargeId,
      paymentIntentId: seeded.paymentIntentId,
    });

    const result = await reconcileStripeRefundOrder({
      orderId: seeded.orderId,
    });
    expect(result).toBe('restored_failure');

    const [orderRow] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
        pspStatusReason: orders.pspStatusReason,
        shippingStatus: orders.shippingStatus,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(orderRow?.paymentStatus).toBe('paid');
    expect(orderRow?.status).toBe('PAID');
    expect(orderRow?.inventoryStatus).toBe('reserved');
    expect(orderRow?.stockRestored).toBe(false);
    expect(orderRow?.restockedAt).toBeNull();
    expect(orderRow?.pspStatusReason).toBe('expired_uncaptured_charge');
    expect(orderRow?.pspStatusReason).not.toBe('REFUND_REQUESTED');
    expect(orderRow?.shippingStatus).toBe('queued');

    const [shipmentRow] = await db
      .select({
        status: shippingShipments.status,
        leaseOwner: shippingShipments.leaseOwner,
        leaseExpiresAt: shippingShipments.leaseExpiresAt,
      })
      .from(shippingShipments)
      .where(eq(shippingShipments.id, seeded.shipmentId))
      .limit(1);

    expect(shipmentRow?.status).toBe('queued');
    expect(shipmentRow?.leaseOwner).toBeNull();
    expect(shipmentRow?.leaseExpiresAt).toBeNull();

    const [productRow] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, seeded.productId))
      .limit(1);
    expect(productRow?.stock).toBe(seeded.initialStock - seeded.reservedQty);

    const releaseKey = `release:${seeded.orderId}:${seeded.productId}`;
    expect(await countMoveKey(releaseKey)).toBe(0);
  });

  it('reconciles stale contained Stripe refunds via the sweep path', async () => {
    seeded = await seedContainedStripeOrder();

    await db
      .update(orders)
      .set({
        updatedAt: new Date(Date.now() - 20 * 60 * 1000),
      })
      .where(eq(orders.id, seeded.orderId));

    retrieveRefundMock.mockResolvedValue({
      refundId: seeded.refundId,
      status: 'succeeded',
      reason: 'requested_by_customer',
      chargeId: seeded.chargeId,
      paymentIntentId: seeded.paymentIntentId,
    });

    const processed = await reconcileStaleStripeRefundOrders({
      olderThanMinutes: 15,
      batchSize: 10,
      workerId: 'batch-2b-test',
      timeBudgetMs: 5_000,
    });

    expect(processed).toBe(1);

    const [orderRow] = await db
      .select({
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        stockRestored: orders.stockRestored,
        pspStatusReason: orders.pspStatusReason,
      })
      .from(orders)
      .where(eq(orders.id, seeded.orderId))
      .limit(1);

    expect(orderRow?.paymentStatus).toBe('refunded');
    expect(orderRow?.status).toBe('CANCELED');
    expect(orderRow?.inventoryStatus).toBe('released');
    expect(orderRow?.stockRestored).toBe(true);
    expect(orderRow?.pspStatusReason).toBe('requested_by_customer');
  });
});
