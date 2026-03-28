import crypto from 'node:crypto';

import { eq, type InferInsertModel } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import { orders, returnRequests, shippingShipments, users } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';
import type { CanonicalFulfillmentStage } from '@/lib/services/shop/fulfillment-stage';
import { toDbMoney } from '@/lib/shop/money';
import { assertNotProductionDb } from '@/lib/tests/helpers/db-safety';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/logging', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/logging')>('@/lib/logging');
  return {
    ...actual,
    logWarn: () => {},
    logError: () => {},
    logInfo: () => {},
  };
});

type OrderInsert = InferInsertModel<typeof orders>;
type ShipmentInsert = InferInsertModel<typeof shippingShipments>;
type ReturnRequestInsert = InferInsertModel<typeof returnRequests>;
type UserInsert = InferInsertModel<typeof users>;

type Scenario = {
  stage: CanonicalFulfillmentStage;
  orderStatus: OrderInsert['status'];
  shippingStatus: OrderInsert['shippingStatus'];
  shipmentStatus?: ShipmentInsert['status'];
  returnStatus?: ReturnRequestInsert['status'];
};

const ownerId = 'user-fulfillment-owner';
const adminId = 'admin-fulfillment-owner';
const seededOrderIds = new Set<string>();

const ownerUser = {
  id: ownerId,
  email: `${ownerId}@example.test`,
  username: 'fulfillment-owner',
  role: 'user' as const,
};

const adminUser = {
  id: adminId,
  email: `${adminId}@example.test`,
  username: 'fulfillment-admin',
  role: 'admin' as const,
};

async function cleanupOrder(orderId: string) {
  await db.delete(returnRequests).where(eq(returnRequests.orderId, orderId));
  await db
    .delete(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

afterEach(async () => {
  for (const orderId of seededOrderIds) {
    await cleanupOrder(orderId);
  }
  seededOrderIds.clear();
});

beforeEach(() => {
  vi.clearAllMocks();
  assertNotProductionDb();
});

async function ensureUser(user: UserInsert) {
  await db.insert(users).values(user).onConflictDoNothing();
}

async function seedScenario(scenario: Scenario): Promise<string> {
  const orderId = crypto.randomUUID();
  seededOrderIds.add(orderId);

  await ensureUser({
    id: ownerUser.id,
    email: ownerUser.email,
    role: 'user',
    name: ownerUser.username,
  });
  await ensureUser({
    id: adminUser.id,
    email: adminUser.email,
    role: 'admin',
    name: adminUser.username,
  });

  await db.insert(orders).values({
    id: orderId,
    userId: ownerId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'monobank',
    paymentStatus: 'paid',
    status: scenario.orderStatus,
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingStatus: scenario.shippingStatus,
    idempotencyKey: `fulfillment-stage-${orderId}`,
  });

  if (scenario.shipmentStatus) {
    await db.insert(shippingShipments).values({
      id: crypto.randomUUID(),
      orderId,
      provider: 'nova_poshta',
      status: scenario.shipmentStatus,
      attemptCount: 1,
    });
  }

  if (scenario.returnStatus) {
    await db.insert(returnRequests).values({
      id: crypto.randomUUID(),
      orderId,
      userId: ownerId,
      status: scenario.returnStatus,
      currency: 'UAH',
      refundAmountMinor: 0,
      idempotencyKey: `return-${orderId}`,
    });
  }

  return orderId;
}

async function callDetailRoute(orderId: string) {
  const { GET } = await import('@/app/api/shop/orders/[id]/route');
  const req = new NextRequest(`http://localhost/api/shop/orders/${orderId}`, {
    method: 'GET',
  });

  return GET(req, { params: Promise.resolve({ id: orderId }) });
}

async function callStatusRoute(orderId: string, view: 'lite' | 'full') {
  const { GET } = await import('@/app/api/shop/orders/[id]/status/route');
  const req = new NextRequest(
    `http://localhost/api/shop/orders/${orderId}/status?view=${view}`,
    {
      method: 'GET',
    }
  );

  return GET(req, { params: Promise.resolve({ id: orderId }) });
}

describe.sequential('canonical fulfillment stage surfaces', () => {
  const getCurrentUserMock = vi.mocked(getCurrentUser);

  it.each<Scenario>([
    {
      stage: 'packed',
      orderStatus: 'PAID',
      shippingStatus: 'label_created',
      shipmentStatus: 'succeeded',
    },
    {
      stage: 'shipped',
      orderStatus: 'PAID',
      shippingStatus: 'shipped',
    },
    {
      stage: 'delivered',
      orderStatus: 'PAID',
      shippingStatus: 'delivered',
    },
    {
      stage: 'canceled',
      orderStatus: 'CANCELED',
      shippingStatus: 'cancelled',
    },
    {
      stage: 'returned',
      orderStatus: 'PAID',
      shippingStatus: 'delivered',
      returnStatus: 'refunded',
    },
  ])(
    'surfaces $stage consistently across customer/admin detail and status APIs',
    async scenario => {
      const orderId = await seedScenario(scenario);
      const { getOrderSummary, getOrderStatusLiteSummary } =
        await import('@/lib/services/orders/summary');

      const summary = await getOrderSummary(orderId);
      expect(summary.fulfillmentStage).toBe(scenario.stage);
      const liteSummary = await getOrderStatusLiteSummary(orderId);
      expect(liteSummary.fulfillmentStage).toBe(scenario.stage);

      getCurrentUserMock.mockResolvedValue(ownerUser);
      const ownerDetailRes = await callDetailRoute(orderId);
      expect(ownerDetailRes.status).toBe(200);
      const ownerDetailJson = await ownerDetailRes.json();
      expect(ownerDetailJson?.order?.fulfillmentStage).toBe(scenario.stage);
      expect(ownerDetailJson?.order?.shippingStatus).toBe(
        scenario.shippingStatus
      );

      getCurrentUserMock.mockResolvedValue(adminUser);
      const adminDetailRes = await callDetailRoute(orderId);
      expect(adminDetailRes.status).toBe(200);
      const adminDetailJson = await adminDetailRes.json();
      expect(adminDetailJson?.order?.fulfillmentStage).toBe(scenario.stage);

      getCurrentUserMock.mockResolvedValue(ownerUser);
      const statusLiteRes = await callStatusRoute(orderId, 'lite');
      expect(statusLiteRes.status).toBe(200);
      const statusLiteJson = await statusLiteRes.json();
      expect(statusLiteJson?.fulfillmentStage).toBe(scenario.stage);
      expect(statusLiteJson?.id).toBe(orderId);

      const statusFullRes = await callStatusRoute(orderId, 'full');
      expect(statusFullRes.status).toBe(200);
      const statusFullJson = await statusFullRes.json();
      expect(statusFullJson?.success).toBe(true);
      expect(statusFullJson?.order?.fulfillmentStage).toBe(scenario.stage);
      expect(statusFullJson?.order?.id).toBe(orderId);
    }
  );
});
