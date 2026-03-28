import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import { getAdminOrderTimeline } from '@/db/queries/shop/admin-orders';
import { adminAuditLog, orders } from '@/db/schema';
import { toDbMoney } from '@/lib/shop/money';

async function cleanup(orderId: string) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

async function insertOrder(args: {
  orderId: string;
  pspMetadata?: Record<string, unknown>;
}) {
  await db.insert(orders).values({
    id: args.orderId,
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
    shippingStatus: 'pending',
    pspMetadata: args.pspMetadata ?? {},
    idempotencyKey: crypto.randomUUID(),
  } as any);
}

describe.sequential('admin order timeline query', () => {
  it('returns canonical audit history in deterministic newest-first order', async () => {
    const orderId = crypto.randomUUID();

    await insertOrder({ orderId });

    try {
      await db.insert(adminAuditLog).values([
        {
          id: crypto.randomUUID(),
          orderId,
          actorUserId: null,
          action: 'shipping_admin_action.mark_shipped',
          targetType: 'order',
          targetId: orderId,
          requestId: 'req-older',
          payload: {
            action: 'mark_shipped',
            fromShippingStatus: 'label_created',
            toShippingStatus: 'shipped',
            fromShipmentStatus: 'succeeded',
          },
          dedupeKey: `audit-${crypto.randomUUID()}`,
          occurredAt: new Date('2026-03-11T08:00:00.000Z'),
          createdAt: new Date('2026-03-11T08:00:00.000Z'),
        },
        {
          id: crypto.randomUUID(),
          orderId,
          actorUserId: null,
          action: 'shipping_admin_action.retry_label_creation',
          targetType: 'order',
          targetId: orderId,
          requestId: 'req-newer-same-time',
          payload: {
            action: 'retry_label_creation',
            fromShippingStatus: 'needs_attention',
            toShippingStatus: 'queued',
            fromShipmentStatus: 'failed',
          },
          dedupeKey: `audit-${crypto.randomUUID()}`,
          occurredAt: new Date('2026-03-12T08:00:00.000Z'),
          createdAt: new Date('2026-03-12T08:05:00.000Z'),
        },
        {
          id: crypto.randomUUID(),
          orderId,
          actorUserId: null,
          action: 'shipping_admin_action.recover_initial_shipment',
          targetType: 'order',
          targetId: orderId,
          requestId: 'req-newest',
          payload: {
            action: 'recover_initial_shipment',
            fromShippingStatus: 'pending',
            toShippingStatus: 'queued',
            fromShipmentStatus: null,
          },
          dedupeKey: `audit-${crypto.randomUUID()}`,
          occurredAt: new Date('2026-03-12T09:00:00.000Z'),
          createdAt: new Date('2026-03-12T09:00:00.000Z'),
        },
      ] as any);

      const history = await getAdminOrderTimeline(orderId);

      expect(history.map(entry => entry.action)).toEqual([
        'recover_initial_shipment',
        'retry_label_creation',
        'mark_shipped',
      ]);
      expect(history.map(entry => entry.requestId)).toEqual([
        'req-newest',
        'req-newer-same-time',
        'req-older',
      ]);
      expect(history.every(entry => entry.source === 'audit')).toBe(true);
    } finally {
      await cleanup(orderId);
    }
  });

  it('falls back to legacy shipping audit when canonical audit rows are absent', async () => {
    const orderId = crypto.randomUUID();

    await insertOrder({
      orderId,
      pspMetadata: {
        shippingAdminAudit: [
          {
            action: 'mark_shipped',
            actorUserId: null,
            requestId: 'req-legacy-older',
            fromShippingStatus: 'label_created',
            toShippingStatus: 'shipped',
            fromShipmentStatus: 'succeeded',
            at: '2026-03-11T08:00:00.000Z',
          },
          {
            action: 'retry_label_creation',
            actorUserId: null,
            requestId: 'req-legacy-newer',
            fromShippingStatus: 'needs_attention',
            toShippingStatus: 'queued',
            fromShipmentStatus: 'failed',
            at: '2026-03-12T08:00:00.000Z',
          },
        ],
      },
    });

    try {
      const history = await getAdminOrderTimeline(orderId);

      expect(history.map(entry => entry.action)).toEqual([
        'retry_label_creation',
        'mark_shipped',
      ]);
      expect(history.map(entry => entry.source)).toEqual(['legacy', 'legacy']);
      expect(history[0]?.requestId).toBe('req-legacy-newer');
      expect(history[1]?.requestId).toBe('req-legacy-older');
    } finally {
      await cleanup(orderId);
    }
  });

  it('merges canonical and legacy history without duplicating the same event', async () => {
    const orderId = crypto.randomUUID();

    await insertOrder({
      orderId,
      pspMetadata: {
        shippingAdminAudit: [
          {
            action: 'mark_shipped',
            actorUserId: null,
            requestId: 'req-shared',
            fromShippingStatus: 'label_created',
            toShippingStatus: 'shipped',
            fromShipmentStatus: 'succeeded',
            at: '2026-03-12T09:00:00.000Z',
          },
          {
            action: 'retry_label_creation',
            actorUserId: null,
            requestId: 'req-legacy-only',
            fromShippingStatus: 'needs_attention',
            toShippingStatus: 'queued',
            fromShipmentStatus: 'failed',
            at: '2026-03-11T08:00:00.000Z',
          },
        ],
      },
    });

    try {
      await db.insert(adminAuditLog).values({
        id: crypto.randomUUID(),
        orderId,
        actorUserId: null,
        action: 'shipping_admin_action.mark_shipped',
        targetType: 'order',
        targetId: orderId,
        requestId: 'req-shared',
        payload: {
          action: 'mark_shipped',
          fromShippingStatus: 'label_created',
          toShippingStatus: 'shipped',
          fromShipmentStatus: 'succeeded',
        },
        dedupeKey: `audit-${crypto.randomUUID()}`,
        occurredAt: new Date('2026-03-12T09:00:00.000Z'),
        createdAt: new Date('2026-03-12T09:00:00.000Z'),
      } as any);

      const history = await getAdminOrderTimeline(orderId);

      expect(history.map(entry => entry.action)).toEqual([
        'mark_shipped',
        'retry_label_creation',
      ]);
      expect(history.map(entry => entry.source)).toEqual(['audit', 'legacy']);
      expect(history.map(entry => entry.requestId)).toEqual([
        'req-shared',
        'req-legacy-only',
      ]);
    } finally {
      await cleanup(orderId);
    }
  });
});
