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
  shippingStatus?: 'pending' | 'queued' | 'label_created';
  shipmentStatus?: 'queued' | 'succeeded' | null;
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
    itemsSubtotalMinor: 900,
    currency: 'UAH',
    paymentProvider: 'stripe',
    paymentStatus: 'paid',
    status: 'PAID',
    inventoryStatus: 'reserved',
    shippingRequired: true,
    shippingPayer: 'customer',
    shippingProvider: 'nova_poshta',
    shippingMethodCode: 'NP_WAREHOUSE',
    shippingAmountMinor: 100,
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

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
          shippingAmountMinor: orders.shippingAmountMinor,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
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
      expect(orderRow).toEqual({
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingAmountMinor: 100,
        totalAmountMinor: 1000,
      });

      const auditRows = await db
        .select({
          action: adminAuditLog.action,
          requestId: adminAuditLog.requestId,
        })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, seed.orderId));

      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toEqual({
        action: 'order_admin_action.edit_shipping',
        requestId,
      });
    } finally {
      await cleanup(seed);
    }
  });

  it('rejects quote-affecting shipping selection changes so totals cannot drift', async () => {
    const seed = await seedEditableOrder();
    const requestId = `req_${crypto.randomUUID()}`;

    try {
      await expect(
        applyAdminOrderShippingEdit({
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
        })
      ).rejects.toMatchObject({
        name: 'AdminOrderShippingEditError',
        code: 'SHIPPING_EDIT_REQUIRES_TOTAL_SYNC',
        status: 409,
      });

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
          shippingProvider: orders.shippingProvider,
          shippingAmountMinor: orders.shippingAmountMinor,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(orderRow).toEqual({
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingProvider: 'nova_poshta',
        shippingAmountMinor: 100,
        totalAmountMinor: 1000,
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
      });

      const auditRows = await db
        .select({
          action: adminAuditLog.action,
          requestId: adminAuditLog.requestId,
          payload: adminAuditLog.payload,
        })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, seed.orderId));

      expect(auditRows).toHaveLength(0);
    } finally {
      await cleanup(seed);
    }
  });

  it('surfaces invalid shipping address before total-sync rejection for stale quote-affecting refs', async () => {
    const seed = await seedEditableOrder();
    const requestId = `req_${crypto.randomUUID()}`;

    try {
      await expect(
        applyAdminOrderShippingEdit({
          orderId: seed.orderId,
          actorUserId: null,
          requestId,
          shipping: {
            provider: 'nova_poshta',
            methodCode: 'NP_COURIER',
            selection: {
              cityRef: `missing_city_${crypto.randomUUID()}`,
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
        })
      ).rejects.toMatchObject({
        name: 'AdminOrderShippingEditError',
        code: 'INVALID_SHIPPING_ADDRESS',
        status: 400,
      });

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
          shippingProvider: orders.shippingProvider,
          shippingAmountMinor: orders.shippingAmountMinor,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(orderRow).toEqual({
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingProvider: 'nova_poshta',
        shippingAmountMinor: 100,
        totalAmountMinor: 1000,
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
      });

      const auditRows = await db
        .select({
          action: adminAuditLog.action,
        })
        .from(adminAuditLog)
        .where(eq(adminAuditLog.orderId, seed.orderId));

      expect(auditRows).toHaveLength(0);
    } finally {
      await cleanup(seed);
    }
  });

  it('keeps fulfillment-facing persisted snapshot coherent for recipient-only edits while shipment stays queued', async () => {
    const seed = await seedEditableOrder({
      shippingStatus: 'queued',
      shipmentStatus: 'queued',
    });

    try {
      const result = await applyAdminOrderShippingEdit({
        orderId: seed.orderId,
        actorUserId: null,
        requestId: `req_${crypto.randomUUID()}`,
        shipping: {
          provider: 'nova_poshta',
          methodCode: 'NP_WAREHOUSE',
          selection: {
            cityRef: seed.cityRef,
            warehouseRef: seed.warehouseRef,
          },
          recipient: {
            fullName: 'Queue Safe',
            phone: '+380931112233',
            email: 'queue@example.com',
            comment: 'Use the side entrance',
          },
        },
      });

      expect(result).toEqual({
        orderId: seed.orderId,
        shippingMethodCode: 'NP_WAREHOUSE',
        changed: true,
      });

      const [shipmentRow] = await db
        .select({
          status: shippingShipments.status,
        })
        .from(shippingShipments)
        .where(eq(shippingShipments.orderId, seed.orderId))
        .limit(1);

      const [shippingRow] = await db
        .select({
          shippingAddress: orderShipping.shippingAddress,
        })
        .from(orderShipping)
        .where(eq(orderShipping.orderId, seed.orderId))
        .limit(1);

      const [orderRow] = await db
        .select({
          shippingMethodCode: orders.shippingMethodCode,
          shippingStatus: orders.shippingStatus,
          shippingAmountMinor: orders.shippingAmountMinor,
          totalAmountMinor: orders.totalAmountMinor,
        })
        .from(orders)
        .where(eq(orders.id, seed.orderId))
        .limit(1);

      expect(shipmentRow?.status).toBe('queued');
      expect(orderRow).toEqual({
        shippingMethodCode: 'NP_WAREHOUSE',
        shippingStatus: 'queued',
        shippingAmountMinor: 100,
        totalAmountMinor: 1000,
      });
      expect(shippingRow?.shippingAddress).toMatchObject({
        methodCode: 'NP_WAREHOUSE',
        quote: {
          currency: 'UAH',
          amountMinor: 100,
          quoteFingerprint: `quote_${seed.orderId}`,
        },
        recipient: {
          fullName: 'Queue Safe',
          phone: '+380931112233',
          email: 'queue@example.com',
          comment: 'Use the side entrance',
        },
      });
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
