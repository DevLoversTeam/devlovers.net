import crypto from 'node:crypto';

import { and, asc, eq, sql } from 'drizzle-orm';
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
  buildCarrierCreatePayloadIdentity,
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

import { buildShippingEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import { writeShippingEvent } from '@/lib/services/shop/events/write-shipping-event';
import {
  createInternetDocument,
  NovaPoshtaApiError,
  type NovaPoshtaCreateTtnInput,
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

function workerEvents(
  events: Awaited<ReturnType<typeof readOrderShippingEvents>>
) {
  return events.filter(event => event.eventSource === 'shipments_worker');
}

async function readInternalCarrierEvents(shipmentId: string) {
  return db
    .select({
      eventName: shippingEvents.eventName,
      eventSource: shippingEvents.eventSource,
      eventRef: shippingEvents.eventRef,
      trackingNumber: shippingEvents.trackingNumber,
      dedupeKey: shippingEvents.dedupeKey,
      payload: shippingEvents.payload,
    })
    .from(shippingEvents)
    .where(
      and(
        eq(shippingEvents.shipmentId, shipmentId),
        eq(shippingEvents.eventSource, 'shipments_worker_internal')
      )
    )
    .orderBy(asc(shippingEvents.createdAt), asc(shippingEvents.id));
}

function carrierSuccessOutcomeKeys(
  events: Awaited<ReturnType<typeof readInternalCarrierEvents>>
) {
  return new Set(
    events
      .filter(event => event.eventName === 'carrier_create_succeeded_internal')
      .map(event => `${event.eventRef ?? ''}::${event.trackingNumber ?? ''}`)
  );
}

async function buildAuthoritativeNovaPoshtaRequestPayload(
  seed: Seeded
): Promise<NovaPoshtaCreateTtnInput> {
  const [row] = await db
    .select({
      totalAmountMinor: orders.totalAmountMinor,
      shippingAddress: orderShipping.shippingAddress,
    })
    .from(orders)
    .innerJoin(orderShipping, eq(orderShipping.orderId, orders.id))
    .where(eq(orders.id, seed.orderId))
    .limit(1);

  const shippingAddress = row?.shippingAddress as
    | Record<string, unknown>
    | undefined;
  const selection = shippingAddress?.selection as
    | Record<string, unknown>
    | undefined;

  const totalAmountMinor = row?.totalAmountMinor ?? 0;
  const defaultWeightGramsRaw = Number.parseInt(
    process.env.NP_DEFAULT_WEIGHT_GRAMS ?? '1000',
    10
  );
  const defaultWeightGrams =
    Number.isFinite(defaultWeightGramsRaw) && defaultWeightGramsRaw > 0
      ? defaultWeightGramsRaw
      : 1000;

  return {
    payerType: 'Recipient',
    paymentMethod: 'Cash',
    cargoType: process.env.NP_DEFAULT_CARGO_TYPE?.trim() || 'Cargo',
    serviceType: 'WarehouseWarehouse',
    seatsAmount: 1,
    weightKg: Math.max(0.001, defaultWeightGrams / 1000),
    description: `DevLovers order ${seed.orderId}`,
    declaredCostUah: Math.max(
      300,
      Math.floor((Math.trunc(totalAmountMinor) + 50) / 100)
    ),
    sender: {
      cityRef: process.env.NP_SENDER_CITY_REF as string,
      senderRef: process.env.NP_SENDER_REF as string,
      warehouseRef: process.env.NP_SENDER_WAREHOUSE_REF as string,
      contactRef: process.env.NP_SENDER_CONTACT_REF as string,
      phone: process.env.NP_SENDER_PHONE as string,
    },
    recipient: {
      cityRef: selection?.cityRef as string,
      warehouseRef: selection?.warehouseRef as string,
      addressLine1: null,
      addressLine2: null,
      fullName: 'Test User',
      phone: '+380501112233',
    },
  };
}

function buildCarrierCreateRequestDedupeKeyForTest(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
}) {
  return buildShippingEventDedupeKey({
    domain: 'carrier_create',
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    provider: args.provider,
    phase: 'requested',
  });
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

  it('same shipment payload semantics -> stable canonical identity hash', () => {
    const payloadA = {
      payerType: 'Recipient',
      paymentMethod: 'Cash',
      cargoType: 'Cargo',
      serviceType: 'WarehouseWarehouse',
      seatsAmount: 1,
      weightKg: 0.5,
      description: 'DevLovers order test-order',
      declaredCostUah: 300,
      sender: {
        cityRef: 'city-a',
        senderRef: 'sender-a',
        warehouseRef: 'warehouse-a',
        contactRef: 'contact-a',
        phone: '+380501234567',
      },
      recipient: {
        cityRef: 'city-b',
        warehouseRef: 'warehouse-b',
        addressLine1: null,
        addressLine2: null,
        fullName: 'Test User',
        phone: '+380501112233',
      },
    } as const;

    const payloadB = {
      description: 'DevLovers order test-order',
      declaredCostUah: 300,
      cargoType: 'Cargo',
      paymentMethod: 'Cash',
      payerType: 'Recipient',
      seatsAmount: 1,
      serviceType: 'WarehouseWarehouse',
      weightKg: 0.5,
      recipient: {
        phone: '+380501112233',
        fullName: 'Test User',
        addressLine2: null,
        addressLine1: null,
        warehouseRef: 'warehouse-b',
        cityRef: 'city-b',
      },
      sender: {
        phone: '+380501234567',
        contactRef: 'contact-a',
        warehouseRef: 'warehouse-a',
        senderRef: 'sender-a',
        cityRef: 'city-a',
      },
    } as const;

    const identityA = buildCarrierCreatePayloadIdentity(payloadA);
    const identityB = buildCarrierCreatePayloadIdentity(payloadB);

    expect(identityA.canonicalPayload).toEqual(identityB.canonicalPayload);
    expect(identityA.canonicalHash).toBe(identityB.canonicalHash);
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
      const publicEvents = workerEvents(events);
      expect(publicEvents.length).toBe(2);
      expect(publicEvents.map(event => event.eventName)).toEqual(
        expect.arrayContaining(['creating_label', 'label_created'])
      );
      const creatingLabelEvents = publicEvents.filter(
        event => event.eventName === 'creating_label'
      );
      expect(creatingLabelEvents).toHaveLength(1);
      expect(
        publicEvents.every(event => event.eventSource === 'shipments_worker')
      ).toBe(true);

      const internalEvents = await readInternalCarrierEvents(seed.shipmentId);
      expect(internalEvents.map(event => event.eventName)).toEqual([
        'carrier_create_requested_internal',
        'carrier_create_succeeded_internal',
      ]);
      expect(carrierSuccessOutcomeKeys(internalEvents).size).toBe(1);
      expect(
        publicEvents.filter(event => event.eventName === 'label_created')
      ).toHaveLength(1);
      expect(
        (internalEvents[0]?.payload as { canonicalHash?: string } | undefined)
          ?.canonicalHash
      ).toMatch(/^[a-f0-9]{64}$/);
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
      const publicEvents = workerEvents(events);
      expect(publicEvents.length).toBe(2);
      expect(publicEvents.map(event => event.eventName)).toEqual(
        expect.arrayContaining([
          'creating_label',
          'label_creation_retry_scheduled',
        ])
      );

      const internalEvents = await readInternalCarrierEvents(seed.shipmentId);
      expect(internalEvents.map(event => event.eventName)).toEqual([
        'carrier_create_requested_internal',
      ]);

      const retryEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_retry_scheduled'
      );
      expect(retryEvents).toHaveLength(1);
      expect(retryEvents[0]?.statusTo).toBe('queued');
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
      const publicEvents = workerEvents(events);
      expect(publicEvents.length).toBe(2);
      expect(publicEvents.map(event => event.eventName)).toEqual(
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
        orderShippingStatus: 'queued',
      });

      try {
        await db
          .update(orders)
          .set({
            paymentStatus,
            status: orderStatus,
            inventoryStatus,
          } as any)
          .where(eq(orders.id, seed.orderId));

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

        expect(shipment?.status).toBe('needs_attention');
        expect(shipment?.attemptCount).toBe(0);
        expect(shipment?.leaseOwner).toBeNull();

        const [order] = await db
          .select({
            shippingStatus: orders.shippingStatus,
          })
          .from(orders)
          .where(eq(orders.id, seed.orderId))
          .limit(1);

        expect(order?.shippingStatus).toBe('cancelled');

        const events = await readOrderShippingEvents(seed.orderId);
        expect(events.some(event => event.eventName === 'creating_label')).toBe(
          false
        );
      } finally {
        await cleanupSeed(seed);
      }
    }
  );

  it('replays persisted carrier success after lease loss without a second carrier create', async () => {
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
      expect(createInternetDocument).toHaveBeenCalledTimes(1);

      const internalEventsAfterFirstRun = await readInternalCarrierEvents(
        seed.shipmentId
      );
      expect(internalEventsAfterFirstRun.map(event => event.eventName)).toEqual(
        [
          'carrier_create_requested_internal',
          'carrier_create_succeeded_internal',
        ]
      );
      expect(carrierSuccessOutcomeKeys(internalEventsAfterFirstRun).size).toBe(
        1
      );

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

      await db
        .update(shippingShipments)
        .set({ leaseExpiresAt: new Date(Date.now() - 5_000) } as any)
        .where(eq(shippingShipments.id, seed.shipmentId));

      const replayResult = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(replayResult).toMatchObject({
        claimed: 1,
        processed: 1,
        succeeded: 1,
        retried: 0,
        needsAttention: 0,
      });
      expect(createInternetDocument).toHaveBeenCalledTimes(1);

      const [replayedShipment] = await db
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

      expect(replayedShipment?.status).toBe('succeeded');
      expect(replayedShipment?.attemptCount).toBe(1);
      expect(replayedShipment?.providerRef).toBe('np-provider-ref-lease-lost');
      expect(replayedShipment?.trackingNumber).toBe('20450000777777');
      expect(replayedShipment?.leaseOwner).toBeNull();

      const [replayedOrder] = await db
        .select({
          shippingStatus: orders.shippingStatus,
          trackingNumber: orders.trackingNumber,
          shippingProviderRef: orders.shippingProviderRef,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(replayedOrder?.shippingStatus).toBe('label_created');
      expect(replayedOrder?.trackingNumber).toBe('20450000777777');
      expect(replayedOrder?.shippingProviderRef).toBe(
        'np-provider-ref-lease-lost'
      );

      const internalEventsAfterReplay = await readInternalCarrierEvents(
        seed.shipmentId
      );
      expect(carrierSuccessOutcomeKeys(internalEventsAfterReplay).size).toBe(1);
    } finally {
      warnSpy.mockRestore();
      await cleanupSeed(seed);
    }
  });

  it('blocks retry of the same carrier-create intent without a second external create', async () => {
    const seed = await seedShipment({
      shipmentStatus: 'failed',
      attemptCount: 1,
    });

    try {
      const authoritativePayload =
        await buildAuthoritativeNovaPoshtaRequestPayload(seed);
      const authoritativeIdentity =
        buildCarrierCreatePayloadIdentity(authoritativePayload);

      await db.insert(shippingEvents).values({
        orderId: seed.orderId,
        shipmentId: seed.shipmentId,
        provider: 'nova_poshta',
        eventName: 'carrier_create_requested_internal',
        eventSource: 'shipments_worker_internal',
        payload: {
          canonicalHash: authoritativeIdentity.canonicalHash,
          canonicalPayload: authoritativeIdentity.canonicalPayload,
        },
        dedupeKey: buildCarrierCreateRequestDedupeKeyForTest({
          orderId: seed.orderId,
          shipmentId: seed.shipmentId,
          provider: 'nova_poshta',
        }),
      } as any);

      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-should-not-run',
        trackingNumber: '20450000666666',
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
        retried: 0,
        needsAttention: 1,
      });
      expect(createInternetDocument).not.toHaveBeenCalled();

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          lastErrorCode: shippingShipments.lastErrorCode,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(2);
      expect(shipment?.lastErrorCode).toBe('CARRIER_CREATE_RETRY_BLOCKED');
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

      expect(order?.shippingStatus).toBe('needs_attention');
      expect(order?.trackingNumber).toBeNull();
      expect(order?.shippingProviderRef).toBeNull();

      const publicEvents = workerEvents(
        await readOrderShippingEvents(seed.orderId)
      );
      const terminalEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_needs_attention'
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]?.eventRef).toBe('CARRIER_CREATE_RETRY_BLOCKED');
      expect(
        publicEvents.some(
          event => event.eventName === 'label_creation_retry_scheduled'
        )
      ).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('detects payload drift for the same shipment intent and fails closed', async () => {
    const seed = await seedShipment({
      shipmentStatus: 'failed',
      attemptCount: 1,
    });

    try {
      const authoritativePayload =
        await buildAuthoritativeNovaPoshtaRequestPayload(seed);
      const originalIdentity =
        buildCarrierCreatePayloadIdentity(authoritativePayload);

      await db.insert(shippingEvents).values({
        orderId: seed.orderId,
        shipmentId: seed.shipmentId,
        provider: 'nova_poshta',
        eventName: 'carrier_create_requested_internal',
        eventSource: 'shipments_worker_internal',
        payload: {
          canonicalHash: originalIdentity.canonicalHash,
          canonicalPayload: originalIdentity.canonicalPayload,
        },
        dedupeKey: buildCarrierCreateRequestDedupeKeyForTest({
          orderId: seed.orderId,
          shipmentId: seed.shipmentId,
          provider: 'nova_poshta',
        }),
      } as any);

      const [shippingRow] = await db
        .select({
          shippingAddress: orderShipping.shippingAddress,
        })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      const shippingAddress = shippingRow?.shippingAddress as
        | Record<string, unknown>
        | undefined;
      const selection = shippingAddress?.selection as
        | Record<string, unknown>
        | undefined;

      await db
        .update(orderShipping)
        .set({
          shippingAddress: {
            ...(shippingAddress ?? {}),
            selection: {
              ...(selection ?? {}),
              warehouseRef: crypto.randomUUID(),
            },
          },
        } as any)
        .where(eq(orderShipping.orderId, seed.orderId));

      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-drift-should-not-run',
        trackingNumber: '20450000555555',
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
        retried: 0,
        needsAttention: 1,
      });
      expect(createInternetDocument).not.toHaveBeenCalled();

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          lastErrorCode: shippingShipments.lastErrorCode,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(2);
      expect(shipment?.lastErrorCode).toBe('CARRIER_CREATE_PAYLOAD_DRIFT');
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

      expect(order?.shippingStatus).toBe('needs_attention');
      expect(order?.trackingNumber).toBeNull();
      expect(order?.shippingProviderRef).toBeNull();

      const publicEvents = workerEvents(
        await readOrderShippingEvents(seed.orderId)
      );
      const terminalEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_needs_attention'
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]?.eventRef).toBe('CARRIER_CREATE_PAYLOAD_DRIFT');
      expect(
        publicEvents.some(
          event => event.eventName === 'label_creation_retry_scheduled'
        )
      ).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('detects conflicting duplicate shipment success outcomes and contains them', async () => {
    const seed = await seedShipment({
      shipmentStatus: 'failed',
      attemptCount: 1,
    });

    try {
      await db.insert(shippingEvents).values([
        {
          orderId: seed.orderId,
          shipmentId: seed.shipmentId,
          provider: 'nova_poshta',
          eventName: 'carrier_create_succeeded_internal',
          eventSource: 'shipments_worker_internal',
          eventRef: 'np-provider-ref-conflict-a',
          trackingNumber: '20450000444441',
          payload: {
            canonicalHash: 'conflict-hash-a',
            providerRef: 'np-provider-ref-conflict-a',
            trackingNumber: '20450000444441',
          },
          dedupeKey: buildShippingEventDedupeKey({
            domain: 'carrier_create',
            orderId: seed.orderId,
            shipmentId: seed.shipmentId,
            provider: 'nova_poshta',
            phase: 'succeeded',
            conflictSeed: 'a',
          }),
        },
        {
          orderId: seed.orderId,
          shipmentId: seed.shipmentId,
          provider: 'nova_poshta',
          eventName: 'carrier_create_succeeded_internal',
          eventSource: 'shipments_worker_internal',
          eventRef: 'np-provider-ref-conflict-b',
          trackingNumber: '20450000444442',
          payload: {
            canonicalHash: 'conflict-hash-b',
            providerRef: 'np-provider-ref-conflict-b',
            trackingNumber: '20450000444442',
          },
          dedupeKey: buildShippingEventDedupeKey({
            domain: 'carrier_create',
            orderId: seed.orderId,
            shipmentId: seed.shipmentId,
            provider: 'nova_poshta',
            phase: 'succeeded',
            conflictSeed: 'b',
          }),
        },
      ] as any);

      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-should-not-run-conflict',
        trackingNumber: '20450000444443',
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
        retried: 0,
        needsAttention: 1,
      });
      expect(createInternetDocument).not.toHaveBeenCalled();

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          lastErrorCode: shippingShipments.lastErrorCode,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(2);
      expect(shipment?.lastErrorCode).toBe('CARRIER_CREATE_SUCCESS_CONFLICT');
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

      expect(order?.shippingStatus).toBe('needs_attention');
      expect(order?.trackingNumber).toBeNull();
      expect(order?.shippingProviderRef).toBeNull();

      const internalEvents = await readInternalCarrierEvents(seed.shipmentId);
      expect(carrierSuccessOutcomeKeys(internalEvents).size).toBe(2);

      const publicEvents = workerEvents(
        await readOrderShippingEvents(seed.orderId)
      );
      const terminalEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_needs_attention'
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]?.eventRef).toBe(
        'CARRIER_CREATE_SUCCESS_CONFLICT'
      );
      expect(
        publicEvents.some(event => event.eventName === 'label_created')
      ).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('keeps terminal needs_attention explicit when order transition is blocked during terminal failure handling', async () => {
    const seed = await seedShipment({ orderShippingStatus: 'queued' });

    try {
      vi.mocked(createInternetDocument).mockImplementation(async () => {
        await db
          .update(orders)
          .set({ shippingStatus: 'shipped' } as any)
          .where(eq(orders.id, seed.orderId));

        throw new NovaPoshtaApiError('NP_VALIDATION_ERROR', 'invalid', 400);
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
        retried: 0,
        needsAttention: 1,
      });

      const [shipment] = await db
        .select({
          status: shippingShipments.status,
          attemptCount: shippingShipments.attemptCount,
          lastErrorCode: shippingShipments.lastErrorCode,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.lastErrorCode).toBe('NP_VALIDATION_ERROR');
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

      const publicEvents = workerEvents(
        await readOrderShippingEvents(seed.orderId)
      );
      const terminalEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_needs_attention'
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]?.eventRef).toBe('NP_VALIDATION_ERROR');
      expect(
        publicEvents.some(
          event => event.eventName === 'label_creation_retry_scheduled'
        )
      ).toBe(false);
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('converts carrier success into explicit needs_attention when the order transition becomes blocked after carrier success', async () => {
    const seed = await seedShipment({ orderShippingStatus: 'queued' });

    try {
      const originalExecute = db.execute.bind(db);
      const executeSpy = vi.spyOn(db, 'execute');
      let interceptionOccurred = false;

      vi.mocked(createInternetDocument).mockResolvedValue({
        providerRef: 'np-provider-ref-blocked-after-success',
        trackingNumber: '20450000333333',
      });

      // This intentionally intercepts a fragile SQL/queryChunks pattern in the
      // markSucceeded CTE flow to simulate the race where shipment success
      // persists but the downstream order update is reported as blocked. If the
      // update shipping_shipments/provider_ref/tracking_number or CTE shape
      // changes, this interception likely needs updating too.
      executeSpy.mockImplementation((async (query: unknown) => {
        const sqlText = Array.isArray(
          (query as { queryChunks?: unknown[] })?.queryChunks
        )
          ? (query as { queryChunks: unknown[] }).queryChunks
              .map(chunk => {
                if (
                  chunk &&
                  typeof chunk === 'object' &&
                  'value' in (chunk as Record<string, unknown>) &&
                  Array.isArray((chunk as { value?: unknown }).value)
                ) {
                  return ((chunk as { value: unknown[] }).value ?? []).join('');
                }
                return String(chunk ?? '');
              })
              .join('')
          : '';

        if (
          sqlText.includes('update shipping_shipments s') &&
          sqlText.includes('provider_ref =') &&
          sqlText.includes('tracking_number =')
        ) {
          interceptionOccurred = true;

          await originalExecute(sql`
            update shipping_shipments
            set status = 'succeeded',
                attempt_count = attempt_count + 1,
                provider_ref = ${'np-provider-ref-blocked-after-success'},
                tracking_number = ${'20450000333333'},
                last_error_code = null,
                last_error_message = null,
                next_attempt_at = null,
                lease_owner = null,
                lease_expires_at = null,
                updated_at = now()
            where id = ${seed.shipmentId}::uuid
          `);

          await originalExecute(sql`
            update orders
            set shipping_status = 'shipped',
                updated_at = now()
            where id = ${seed.orderId}::uuid
          `);

          return [
            {
              shipment_updated: true,
              order_updated: false,
              order_id: seed.orderId,
            },
          ] as any;
        }

        return originalExecute(query as any);
      }) as typeof db.execute);

      const result = await runShippingShipmentsWorker({
        runId: crypto.randomUUID(),
        limit: 10,
        leaseSeconds: 120,
        maxAttempts: 5,
        baseBackoffSeconds: 10,
      });

      expect(interceptionOccurred).toBe(true);
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
          lastErrorCode: shippingShipments.lastErrorCode,
          providerRef: shippingShipments.providerRef,
          trackingNumber: shippingShipments.trackingNumber,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.id, seed.shipmentId))
        .limit(1);

      expect(shipment?.status).toBe('needs_attention');
      expect(shipment?.attemptCount).toBe(1);
      expect(shipment?.lastErrorCode).toBe('SHIPMENT_SUCCESS_APPLY_BLOCKED');
      expect(shipment?.providerRef).toBe(
        'np-provider-ref-blocked-after-success'
      );
      expect(shipment?.trackingNumber).toBe('20450000333333');

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

      const publicEvents = workerEvents(
        await readOrderShippingEvents(seed.orderId)
      );
      const terminalEvents = publicEvents.filter(
        event => event.eventName === 'label_creation_needs_attention'
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0]?.eventRef).toBe(
        'SHIPMENT_SUCCESS_APPLY_BLOCKED'
      );
      expect(
        publicEvents.some(event => event.eventName === 'label_created')
      ).toBe(false);
    } finally {
      vi.restoreAllMocks();
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
