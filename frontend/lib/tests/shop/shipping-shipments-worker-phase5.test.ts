import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orderShipping, orders, shippingShipments } from '@/db/schema';
import { resetEnvCache } from '@/lib/env';
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
  attemptCount?: number;
  shipmentStatus?: 'queued' | 'failed' | 'processing' | 'needs_attention' | 'succeeded';
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
    paymentStatus: 'paid',
    paymentProvider: 'stripe',
    status: 'PAID',
    inventoryStatus: 'reserved',
    idempotencyKey: `shipping-worker-${orderId}`,
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: 'queued',
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
  await db.delete(shippingShipments).where(eq(shippingShipments.id, seed.shipmentId));
  await db.delete(orderShipping).where(eq(orderShipping.orderId, seed.orderId));
  await db.delete(orders).where(eq(orders.id, seed.orderId));
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
      expect(shipment?.lastErrorMessage).toBe('Nova Poshta temporary API error.');

      const [order] = await db
        .select({
          shippingStatus: orders.shippingStatus,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      expect(order?.shippingStatus).toBe('queued');
    } finally {
      await cleanupSeed(seed);
    }
  });

  it('max attempts -> needs_attention', async () => {
    const seed = await seedShipment({ attemptCount: 2, shipmentStatus: 'failed' });

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
    } finally {
      await cleanupSeed(seed);
    }
  });
});

