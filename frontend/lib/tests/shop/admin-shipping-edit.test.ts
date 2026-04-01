import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '@/db';
import {
  adminAuditLog,
  npCities,
  npWarehouses,
  orders,
  orderShipping,
  shippingShipments,
} from '@/db/schema';
import { applyAdminOrderShippingEdit } from '@/lib/services/shop/shipping/admin-edit';
import { toDbMoney } from '@/lib/shop/money';

type SeededOrder = {
  orderId: string;
  cityRef: string;
  warehouseRef: string;
  shipmentId: string | null;
};

async function cleanup(seed: SeededOrder) {
  await db.delete(adminAuditLog).where(eq(adminAuditLog.orderId, seed.orderId));
  await db.delete(orderShipping).where(eq(orderShipping.orderId, seed.orderId));
  if (seed.shipmentId) {
    await db
      .delete(shippingShipments)
      .where(eq(shippingShipments.id, seed.shipmentId));
  }
  await db.delete(orders).where(eq(orders.id, seed.orderId));
  await db.delete(npWarehouses).where(eq(npWarehouses.ref, seed.warehouseRef));
  await db.delete(npCities).where(eq(npCities.ref, seed.cityRef));
}

async function seedEditableOrder(args?: {
  shippingStatus?: 'pending' | 'label_created';
  shipmentStatus?: 'succeeded' | null;
}): Promise<SeededOrder> {
  const orderId = crypto.randomUUID();
  const cityRef = `city_${crypto.randomUUID()}`;
  const warehouseRef = `wh_${crypto.randomUUID()}`;
  const shipmentId = args?.shipmentStatus ? crypto.randomUUID() : null;

  await db.insert(npCities).values({
    ref: cityRef,
    nameUa: 'Kyiv',
    nameRu: 'Киев',
    area: 'Kyivska',
    region: 'Kyiv',
    settlementType: 'місто',
    isActive: true,
  } as any);

  await db.insert(npWarehouses).values({
    ref: warehouseRef,
    cityRef,
    settlementRef: cityRef,
    number: '12',
    type: 'Branch',
    name: 'Warehouse 12',
    address: 'Khreshchatyk 1',
    isPostMachine: false,
    isActive: true,
  } as any);

  await db.insert(orders).values({
    id: orderId,
    totalAmountMinor: 1000,
    totalAmount: toDbMoney(1000),
    currency: 'UAH',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: null,
    shippingStatus: args?.shippingStatus ?? 'pending',
    idempotencyKey: `admin-shipping-edit-${orderId}`,
  } as any);

  await db.insert(orderShipping).values({
    orderId,
    shippingAddress: {
      provider: 'nova_poshta',
      methodCode: 'NP_WAREHOUSE',
      quote: {
        currency: 'UAH',
        amountMinor: 100,
        quoteFingerprint: `quote_${orderId}`,
      },
      selection: {
        cityRef,
        cityNameUa: 'Kyiv',
        cityNameRu: 'Киев',
        area: 'Kyivska',
        region: 'Kyiv',
        warehouseRef,
        warehouseName: 'Warehouse 12',
        warehouseAddress: 'Khreshchatyk 1',
        addressLine1: null,
        addressLine2: null,
      },
      recipient: {
        fullName: 'Ivan Petrenko',
        phone: '+380501112233',
        email: 'ivan@example.com',
        comment: 'Call me before delivery',
      },
    },
  } as any);

  if (shipmentId && args?.shipmentStatus) {
    await db.insert(shippingShipments).values({
      id: shipmentId,
      orderId,
      provider: 'nova_poshta',
      status: args.shipmentStatus,
      attemptCount: 1,
      nextAttemptAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    } as any);
  }

  return {
    orderId,
    cityRef,
    warehouseRef,
    shipmentId,
  };
}

describe.sequential('admin shipping edit service', () => {
  it('preserves the existing quote when the edit changes recipient-only data', async () => {
    const seed = await seedEditableOrder();
    const requestId = `req_${crypto.randomUUID()}`;

    try {
      const result = await applyAdminOrderShippingEdit({
        orderId: seed.orderId,
        actorUserId: null,
        requestId,
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRef,
          },
          recipient: {
            fullName: 'Olena Petrenko',
            phone: '+380671112233',
            email: 'olena@example.com',
            comment: 'Call before delivery',
          },
        },
      });

      expect(result).toEqual({
        orderId: seed.orderId,
        shippingMethodCode: 'NP_WAREHOUSE',
        changed: true,
      });

      const [shippingRow] = await db
        .select({
          shippingAddress: orderShipping.shippingAddress,
        })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      expect(shippingRow?.shippingAddress).toMatchObject({
        provider: 'nova_poshta',
        methodCode: 'NP_WAREHOUSE',
        quote: {
          currency: 'UAH',
          amountMinor: 100,
          quoteFingerprint: `quote_${seed.orderId}`,
        },
        selection: {
          cityRef: seed.cityRef,
          warehouseRef: seed.warehouseRef,
          addressLine1: null,
          addressLine2: null,
        },
        recipient: {
          fullName: 'Olena Petrenko',
          phone: '+380671112233',
          email: 'olena@example.com',
          comment: 'Call before delivery',
        },
      });
    } finally {
      await cleanup(seed);
    }
  });

  it('drops the existing quote when quote-affecting shipping selection changes', async () => {
    const seed = await seedEditableOrder();
    const requestId = `req_${crypto.randomUUID()}`;

    try {
      const result = await applyAdminOrderShippingEdit({
        orderId: seed.orderId,
        actorUserId: null,
        requestId,
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_COURIER',
          selection: {
            cityRef: seed.cityRef,
            addressLine1: 'Khreshchatyk 7',
            addressLine2: 'Apartment 21',
          },
          recipient: {
            fullName: 'Olena Petrenko',
            phone: '+380671112233',
            email: 'olena@example.com',
            comment: 'Call before delivery',
          },
        },
      });

      expect(result).toEqual({
        orderId: seed.orderId,
        shippingMethodCode: 'NP_COURIER',
        changed: true,
      });

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
          shippingProvider: orders.shippingProvider,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(orderRow).toEqual({
        shippingMethodCode: 'NP_COURIER',
        shippingProvider: 'nova_poshta',
      });

      const [shippingRow] = await db
        .select({
          shippingAddress: orderShipping.shippingAddress,
        })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      expect(shippingRow?.shippingAddress).toMatchObject({
        provider: 'nova_poshta',
        methodCode: 'NP_COURIER',
        selection: {
          cityRef: seed.cityRef,
          warehouseRef: null,
          warehouseName: null,
          warehouseAddress: null,
          addressLine1: 'Khreshchatyk 7',
          addressLine2: 'Apartment 21',
        },
        recipient: {
          fullName: 'Olena Petrenko',
          phone: '+380671112233',
          email: 'olena@example.com',
          comment: 'Call before delivery',
        },
      });
      expect(shippingRow?.shippingAddress).not.toHaveProperty('quote');

      const [auditRow] = await db
        .select({
          action: adminAuditLog.action,
          requestId: adminAuditLog.requestId,
          payload: adminAuditLog.payload,
        })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, seed.orderId))
        .limit(1);

      expect(auditRow?.action).toBe('order_admin_action.edit_shipping');
      expect(auditRow?.requestId).toBe(requestId);
      expect(auditRow?.payload).toMatchObject({
        action: 'edit_shipping',
        shippingProvider: 'nova_poshta',
        fromMethodCode: 'NP_WAREHOUSE',
        toMethodCode: 'NP_COURIER',
        fromCityRef: seed.cityRef,
        toCityRef: seed.cityRef,
        fromWarehouseRef: seed.warehouseRef,
        toWarehouseRef: null,
        addressChanged: true,
        recipientChanged: {
          fullName: true,
          phone: true,
          email: true,
          comment: true,
        },
      });
      expect(auditRow?.payload).not.toHaveProperty('fullName');
      expect(auditRow?.payload).not.toHaveProperty('phone');
      expect(auditRow?.payload).not.toHaveProperty('email');
    } finally {
      await cleanup(seed);
    }
  });

  it('rejects shipping edits once the order is beyond the editable fulfillment window', async () => {
    const seed = await seedEditableOrder({
      shippingStatus: 'label_created',
      shipmentStatus: 'succeeded',
    });

    try {
      await expect(
        applyAdminOrderShippingEdit({
          orderId: seed.orderId,
          actorUserId: null,
          requestId: `req_${crypto.randomUUID()}`,
          shipping: {
            provider: 'nova_poshta',
            methodCode: 'NP_COURIER',
            selection: {
              cityRef: seed.cityRef,
              addressLine1: 'Khreshchatyk 7',
            },
            recipient: {
              fullName: 'Olena Petrenko',
              phone: '+380671112233',
            },
          },
        })
      ).rejects.toMatchObject({
        name: 'AdminOrderShippingEditError',
        code: 'SHIPPING_EDIT_NOT_ALLOWED',
        status: 409,
      });

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);
      expect(orderRow?.shippingMethodCode).toBe('NP_WAREHOUSE');

      const logs = await db
        .select({ id: adminAuditLog.id })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, seed.orderId));
      expect(logs).toHaveLength(0);
    } finally {
      await cleanup(seed);
    }
  });
});
