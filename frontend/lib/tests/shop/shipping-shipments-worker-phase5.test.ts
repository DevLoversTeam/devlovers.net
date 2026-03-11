import crypto from 'node:crypto';

import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  orders,
  orderShipping,
  shippingEvents,
  shippingShipments,
} from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
import * as logging from '@/lib/logging';
import {
  claimQueuedShipmentsForProcessing,
  runShippingShipmentsWorker,
} from '@/lib/services/shop/shipping/shipments-worker';
import { toDbMoney } from '@/lib/shop/money';

vi.mock('@/lib/services/shop/shipping/nova-poshta-client', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/shop/shipping/nova-poshta-client'
  );
  return {
    ...actual,
    createInternetDocument: vi.fn(),
  };
});

vi.mock('@/lib/services/shop/events/write-shipping-event', async () => {
  const actual = await vi.importActual<any>(
    '@/lib/services/shop/events/write-shipping-event'
  );
  return {
    ...actual,
    writeShippingEvent: vi.fn(actual.writeShippingEvent),
  };
});

import { writeShippingEvent } from '@/lib/services/shop/events/write-shipping-event';
import {
  createInternetDocument,
  NovaPoshtaApiError,
} from '@/lib/services/shop/shipping/nova-poshta-client';

type Seeded = {
  orderId: string;
  shipmentId: string;
};

function baseShippingSnapshot() {
  const cityRef = crypto.randomUUID();
  const warehouseRef = crypto.randomUUID();

  return {
    provider: 'nova_poshta',
    methodCode: 'NP_WAREHOUSE',
    selection: {
      cityRef,
      warehouseRef,
      addressLine1: null,
      addressLine2: null,
    },
    recipient: {
      fullName: 'Test User',
      phone: '+380501112233',
      email: 'test@example.com',
      comment: null,
    },
  } as Record<string, unknown>;
}

async function seedShipment(args?: {
  currency?: 'USD' | 'UAH';
  paymentStatus?:
    | 'pending'
    | 'requires_payment'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'needs_review';
  orderStatus?:
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
  attemptCount?: number;
  shipmentStatus?:
    | 'queued'
    | 'failed'
    | 'processing'
    | 'needs_attention'
    | 'succeeded';
  orderShippingStatus?:
    | 'pending'
    | 'queued'
    | 'creating_label'
    | 'label_created'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'needs_attention';
  nextAttemptAt?: Date | null;
}) {
  const orderId = crypto.randomUUID();
  const shipmentId = crypto.randomUUID();

  const currency = args?.currency ?? 'UAH';
  const totalAmountMinor = 12345;

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor,
    totalAmount: toDbMoney(totalAmountMinor),
    currency,
    paymentStatus: args?.paymentStatus ?? 'paid',
    paymentProvider: 'stripe',
    status: args?.orderStatus ?? 'PAID',
    inventoryStatus: args?.inventoryStatus ?? 'reserved',
    idempotencyKey: `shipping-worker-${orderId}`,
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args?.orderShippingStatus ?? 'queued',
  } as any);

  await db.insert(orderShipping).values({
    orderId,
    shippingAddress: baseShippingSnapshot(),
  });

  await db.insert(shippingShipments).values({
    id: shipmentId,
    orderId,
    provider: 'nova_poshta',
    status: args?.shipmentStatus ?? 'queued',
    attemptCount: args?.attemptCount ?? 0,
    nextAttemptAt: args?.nextAttemptAt ?? null,
    leaseOwner: null,
    leaseExpiresAt: null,
  });

  return { orderId, shipmentId } as Seeded;
}

async function cleanupSeed(seed: Seeded) {
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.id, seed.shipmentId));
  await db.delete(orderShipping).where(eq(orderShipping.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
}

async function readOrderShippingEvents(orderId: string) {
  return db
    .select({
      eventName: shippingEvents.eventName,
      statusFrom: shippingEvents.statusFrom,
      statusTo: shippingEvents.statusTo,
      eventSource: shippingEvents.eventSource,
      shipmentId: shippingEvents.shipmentId,
      eventRef: shippingEvents.eventRef,
    })
    .from(shippingEvents)
    .where(eq(shippingEvents.orderId, orderId))
    .orderBy(asc(shippingEvents.createdAt), asc(shippingEvents.id));
}

describe.sequential('shipping shipments worker phase 5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    vi.stubEnv('DATABASE_URL', 'https://example.com/db');
    vi.stubEnv('SHOP_SHIPPING_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_NP_ENABLED', 'true');
    vi.stubEnv('SHOP_SHIPPING_SYNC_ENABLED', 'true');
    vi.stubEnv('NP_API_KEY', 'np-key-test');
    vi.stubEnv('NP_SENDER_CITY_REF', crypto.randomUUID());
    vi.stubEnv('NP_SENDER_WAREHOUSE_REF', crypto.randomUUID());
    vi.stubEnv('NP_SENDER_REF', crypto.randomUUID());
    vi.stubEnv('NP_SENDER_CONTACT_REF', crypto.randomUUID());
    vi.stubEnv('NP_SENDER_NAME', 'DevLovers');
    vi.stubEnv('NP_SENDER_PHONE', '+380501234567');
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it('queued -> succeeded', async () => {
    const seed = await seedShipment();

    try {
      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-1',
        trackingNumber: '20451234567890',
      });

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 1,
        retried: 0,
        needsAttention: 0,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
          leaseOwner: shippingShipments.leaseOwner,
          leaseExpiresAt: shippingShipments.leaseExpiresAt,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('succeeded');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.providerRef).toBe('np-provider-ref-1');
      expect(shipment?.trackingNumber).toBe('20451234567890');
      expect(shipment?.leaseOwner).toBeNull();
      expect(shipment?.leaseExpiresAt).toBeNull();

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
          trackingNumber: orders.trackingNumber,
          shippingProviderRef: orders.shippingProviderRef,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(order?.shippingStatus).toBe('label_created');
      expect(order?.trackingNumber).toBe('20451234567890');
      expect(order?.shippingProviderRef).toBe('np-provider-ref-1');

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.length).toBe(2);
      expect(events.map(event => event.eventName)).toEqual(
        expect.arrayContaining(['creating_label', 'label_created'])
      );
      const creatingLabelEvents = events.filter(
        event => event.eventName === 'creating_label'
      );
      expect(creatingLabelEvents).toHaveLength(1);
      expect(
        events.every(event => event.eventSource === 'shipments_worker')
      ).toBe(true);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('transient fail -> retry', async () => {
    const seed = await seedShipment();

    try {
      vi.mocked(createInternetDocument).mockRejectedValue(
        new NovaPoshtaApiError('NP_HTTP_ERROR', 'temporary', 503)
      );

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 0,
        retried: 1,
        needsAttention: 0,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          nextAttemptAt: shippingShipments.nextAttemptAt,
          lastErrorCode: shippingShipments.lastErrorCode,
          lastErrorMessage: shippingShipments.lastErrorMessage,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('failed');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.nextAttemptAt).toBeTruthy();
      expect(shipment?.lastErrorCode).toBe('NP_HTTP_ERROR');
      expect(shipment?.lastErrorMessage).toBe(
        'Nova Poshta temporary API error.'
      );

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      expect(order?.shippingStatus).toBe('queued');

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.length).toBe(2);
      expect(events.map(event => event.eventName)).toEqual(
        expect.arrayContaining([
          'creating_label',
          'label_creation_retry_scheduled',
        ])
      );
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('keeps retry outcome when failure-path event write throws', async () => {
    const seed = await seedShipment();

    const originalWriteShippingEventImpl = vi
      .mocked(writeShippingEvent)
      .getMockImplementation();

    try {
      vi.mocked(createInternetDocument).mockRejectedValue(
        new NovaPoshtaApiError('NP_HTTP_ERROR', 'temporary', 503)
      );

      vi.mocked(writeShippingEvent).mockImplementation(async (args: any) => {
        if (args?.eventName === 'label_creation_retry_scheduled') {
          throw new Error('failure-event-write-failed');
        }
        if (originalWriteShippingEventImpl) {
          return originalWriteShippingEventImpl(args);
        }
        return { inserted: false, dedupeKey: 'mock_noop', id: null };
      });

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 0,
        retried: 1,
        needsAttention: 0,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          nextAttemptAt: shippingShipments.nextAttemptAt,
          lastErrorCode: shippingShipments.lastErrorCode,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('failed');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.nextAttemptAt).toBeTruthy();
      expect(shipment?.lastErrorCode).toBe('NP_HTTP_ERROR');

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      expect(order?.shippingStatus).toBe('queued');

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.some(event => event.eventName === 'creating_label')).toBe(
        true
      );
      expect(
        events.some(
          event => event.eventName === 'label_creation_retry_scheduled'
        )
      ).toBe(false);
    } finally {
      if (originalWriteShippingEventImpl) {
        vi.mocked(writeShippingEvent).mockImplementation(
          originalWriteShippingEventImpl
        );
      } else {
        vi.mocked(writeShippingEvent).mockReset();
      }
      await cleanupSeed(seed);
    }
  });

  it('max attempts -> needs_attention', async () => {
    const seed = await seedShipment({
      attemptCount: 2,
      shipmentStatus: 'failed',
    });

    try {
      vi.mocked(createInternetDocument).mockRejectedValue(
        new NovaPoshtaApiError('NP_HTTP_ERROR', 'temporary', 503)
      );

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 3,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 0,
        retried: 0,
        needsAttention: 1,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          nextAttemptAt: shippingShipments.nextAttemptAt,
          lastErrorCode: shippingShipments.lastErrorCode,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(3);
      expect(shipment?.nextAttemptAt).toBeNull();
      expect(shipment?.lastErrorCode).toBe('NP_HTTP_ERROR');

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      expect(order?.shippingStatus).toBe('needs_attention');

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.length).toBe(2);
      expect(events.map(event => event.eventName)).toEqual(
        expect.arrayContaining([
          'creating_label',
          'label_creation_needs_attention',
        ])
      );
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('keeps success outcome when post-success event write throws', async () => {
    const seed = await seedShipment();

    const originalWriteShippingEventImpl = vi
      .mocked(writeShippingEvent)
      .getMockImplementation();

    try {
      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-event-fail',
        trackingNumber: '20450000999999',
      });

      vi.mocked(writeShippingEvent).mockImplementation(async (args: any) => {
        if (args?.eventName === 'label_created') {
          throw new Error('event-write-failed');
        }
        if (originalWriteShippingEventImpl) {
          return originalWriteShippingEventImpl(args);
        }
        return { inserted: false, dedupeKey: 'mock_noop', id: null };
      });

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 1,
        retried: 0,
        needsAttention: 0,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
          nextAttemptAt: shippingShipments.nextAttemptAt,
          lastErrorCode: shippingShipments.lastErrorCode,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('succeeded');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.providerRef).toBe('np-provider-ref-event-fail');
      expect(shipment?.trackingNumber).toBe('20450000999999');
      expect(shipment?.nextAttemptAt).toBeNull();
      expect(shipment?.lastErrorCode).toBeNull();

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
          trackingNumber: orders.trackingNumber,
          shippingProviderRef: orders.shippingProviderRef,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(order?.shippingStatus).toBe('label_created');
      expect(order?.trackingNumber).toBe('20450000999999');
      expect(order?.shippingProviderRef).toBe('np-provider-ref-event-fail');

      const eventNames = vi
        .mocked(writeShippingEvent)
        .mock.calls.map(call => (call[0] as { eventName?: string })?.eventName);
      expect(eventNames).toContain('creating_label');
      expect(eventNames).toContain('label_created');
    } finally {
      if (originalWriteShippingEventImpl) {
        vi.mocked(writeShippingEvent).mockImplementation(
          originalWriteShippingEventImpl
        );
      } else {
        vi.mocked(writeShippingEvent).mockReset();
      }
      await cleanupSeed(seed);
    }
  });

  it('filters out blocked transitions before processing so no external label is created', async () => {
    const seed = await seedShipment({ orderShippingStatus: 'shipped' });

    try {
      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-blocked-success',
        trackingNumber: '20450000111111',
      });

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 0,
        processed: 0,
        succeeded: 0,
        retried: 0,
        needsAttention: 0,
      });
      expect(createInternetDocument).not.toHaveBeenCalled();

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('queued');
      expect(shipment?.attemptCount).toBe(0);
      expect(shipment?.providerRef).toBeNull();
      expect(shipment?.trackingNumber).toBeNull();

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
          trackingNumber: orders.trackingNumber,
          shippingProviderRef: orders.shippingProviderRef,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(order?.shippingStatus).toBe('shipped');
      expect(order?.trackingNumber).toBeNull();
      expect(order?.shippingProviderRef).toBeNull();

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.some(event => event.eventName === 'creating_label')).toBe(
        false
      );
      expect(events.some(event => event.eventName === 'label_created')).toBe(
        false
      );
    } finally {
      await cleanupSeed(seed);
    }
  });

  it.each([
    {
      title: 'payment is not paid',
      paymentStatus: 'pending' as const,
      orderStatus: 'PAID' as const,
      inventoryStatus: 'reserved' as const,
    },
    {
      title: 'payment is refunded',
      paymentStatus: 'refunded' as const,
      orderStatus: 'PAID' as const,
      inventoryStatus: 'reserved' as const,
    },
    {
      title: 'order status is canceled',
      paymentStatus: 'paid' as const,
      orderStatus: 'CANCELED' as const,
      inventoryStatus: 'reserved' as const,
    },
    {
      title: 'inventory is not committed',
      paymentStatus: 'paid' as const,
      orderStatus: 'PAID' as const,
      inventoryStatus: 'released' as const,
    },
  ])(
    'does not claim or process queued shipment when $title',
    async ({ paymentStatus, orderStatus, inventoryStatus }) => {
      const seed = await seedShipment({
        paymentStatus,
        orderStatus,
        inventoryStatus,
        orderShippingStatus: 'queued',
      });

      try {
        vi.mocked(createInternetDocument).mockResolvedValue({
          providerRef: 'np-provider-ref-should-not-run',
          trackingNumber: '20450000888888',
        });

        const result = await runShippingShipmentsWorker({
          runId: crypto.randomUUID(),
          limit: 10,
          leaseSeconds: 120,
          maxAttempts: 5,
          baseBackoffSeconds: 10,
        });

        expect(result).toMatchObject({
          claimed: 0,
          processed: 0,
          succeeded: 0,
          retried: 0,
          needsAttention: 0,
        });
        expect(createInternetDocument).not.toHaveBeenCalled();

        const [shipment] = await db
          .select({
            status: shippingShipments.status,
            attemptCount: shippingShipments.attemptCount,
            leaseOwner: shippingShipments.leaseOwner,
          })
          .from(shippingShipments)
          .where(eq(shippingShipments.id, seed.shipmentId))
          .limit(1);

        expect(shipment?.status).toBe('queued');
        expect(shipment?.attemptCount).toBe(0);
        expect(shipment?.leaseOwner).toBeNull();

        const [order] = await db
          .select({
            shippingStatus: orders.shippingStatus,
          })
          .from(orders)
          .where(eq(orders.id, seed.orderId))
          .limit(1);

        expect(order?.shippingStatus).toBe('queued');

        const events = await readOrderShippingEvents(seed.orderId);
        expect(events.some(event => event.eventName === 'creating_label')).toBe(
          false
        );
      } finally {
        await cleanupSeed(seed);
      }
    }
  );

  it('classifies lease loss when shipment row is no longer owned by runId', async () => {
    const seed = await seedShipment({ orderShippingStatus: 'queued' });
    const warnSpy = vi.spyOn(logging, 'logWarn');

    try {
      vi.mocked(createInternetDocument).mockImplementation(async () => {
        await db
          .update(shippingShipments)
          .set({
            leaseOwner: `lease-stolen-${crypto.randomUUID()}`,
            leaseExpiresAt: new Date(Date.now() + 60_000),
          } as any)
          .where(eq(shippingShipments.id, seed.shipmentId));

        return {
          providerRef: 'np-provider-ref-lease-lost',
          trackingNumber: '20450000777777',
        };
      });

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 0,
        retried: 1,
        needsAttention: 0,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
          leaseOwner: shippingShipments.leaseOwner,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('processing');
      expect(shipment?.attemptCount).toBe(0);
      expect(shipment?.providerRef).toBeNull();
      expect(shipment?.trackingNumber).toBeNull();
      expect(shipment?.leaseOwner).toBeTruthy();

      const [order] = await db
        .select({ shippingStatus: orders.shippingStatus })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(order?.shippingStatus).toBe('creating_label');

      expect(
        warnSpy.mock.calls.some(
          ([name, meta]) =>
            name === 'shipping_shipments_worker_lease_lost' &&
            (meta as Record<string, unknown>)?.code === 'SHIPMENT_LEASE_LOST'
        )
      ).toBe(true);
      expect(
        warnSpy.mock.calls.some(
          ([name, meta]) =>
            name === 'shipping_shipments_worker_order_transition_blocked' &&
            (meta as Record<string, unknown>)?.code ===
              'ORDER_TRANSITION_BLOCKED'
        )
      ).toBe(false);
    } finally {
      warnSpy.mockRestore();
      await cleanupSeed(seed);
    }
  });

  it('does not emit retry/needs_attention transition events when order transition is blocked', async () => {
    const seed = await seedShipment({ orderShippingStatus: 'shipped' });

    try {
      vi.mocked(createInternetDocument).mockRejectedValue(
        new NovaPoshtaApiError('NP_HTTP_ERROR', 'temporary', 503)
      );

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(result).toMatchObject({
        claimed: 0,
        processed: 0,
        succeeded: 0,
        retried: 0,
        needsAttention: 0,
      });
      expect(createInternetDocument).not.toHaveBeenCalled();

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          lastErrorCode: shippingShipments.lastErrorCode,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('queued');
      expect(shipment?.attemptCount).toBe(0);
      expect(shipment?.lastErrorCode).toBeNull();

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(order?.shippingStatus).toBe('shipped');

      const events = await readOrderShippingEvents(seed.orderId);
      expect(
        events.some(
          event =>
            event.eventName === 'label_creation_retry_scheduled' ||
            event.eventName === 'label_creation_needs_attention'
        )
      ).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('lease prevents duplicates', async () => {
    const seed = await seedShipment();

    try {
      const first = await claimQueuedShipmentsForProcessing({
        runId: `worker-a-${crypto.randomUUID()}`,
        leaseSeconds: 120,
        limit: 1,
      });
      const second = await claimQueuedShipmentsForProcessing({
        runId: `worker-b-${crypto.randomUUID()}`,
        leaseSeconds: 120,
        limit: 1,
      });

      expect(first.length).toBe(1);
      expect(second.length).toBe(0);

      const events = await readOrderShippingEvents(seed.orderId);
      expect(events.length).toBe(1);
      expect(events[0]?.eventName).toBe('creating_label');
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('dedupes creating_label event on processing-claim replay for same attempt', async () => {
    const seed = await seedShipment({
      shipmentStatus: 'processing',
      attemptCount: 0,
    });

    try {
      const runA = `worker-a-${crypto.randomUUID()}`;
      const first = await claimQueuedShipmentsForProcessing({
        runId: runA,
        leaseSeconds: 120,
        limit: 1,
      });

      expect(first.length).toBe(1);

      await db
        .update(shippingShipments)
        .set({ leaseExpiresAt: new Date(Date.now() - 5_000) } as any)
        .where(eq(shippingShipments.id, seed.shipmentId));

      const runB = `worker-b-${crypto.randomUUID()}`;
      const second = await claimQueuedShipmentsForProcessing({
        runId: runB,
        leaseSeconds: 120,
        limit: 1,
      });

      expect(second.length).toBe(1);

      const events = await readOrderShippingEvents(seed.orderId);
      const creating = events.filter(
        event => event.eventName === 'creating_label'
      );
      expect(creating.length).toBe(1);
    } finally {
      await cleanupSeed(seed);
    }
  });
});
