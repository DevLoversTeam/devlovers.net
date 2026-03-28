import 'server-only';

import { desc, eq, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import { db } from '@/db';
import { returnRequests, shippingShipments } from '@/db/schema/shop';
import {
  type CanonicalFulfillmentStage as ValidationCanonicalFulfillmentStage,
  canonicalFulfillmentStageValues,
} from '@/lib/validation/shop';

export const CANONICAL_FULFILLMENT_STAGES = canonicalFulfillmentStageValues;

export type CanonicalFulfillmentStage = ValidationCanonicalFulfillmentStage;

export type CanonicalFulfillmentStageInput = {
  orderStatus?: string | null | undefined;
  shippingStatus?: string | null | undefined;
  shipmentStatus?: string | null | undefined;
  returnStatus?: string | null | undefined;
};

export type FulfillmentStageSignals = {
  shipmentStatus: string | null;
  returnStatus: string | null;
};

export function latestShipmentStatusSql(orderIdColumn: SQLWrapper): SQL {
  return sql`(
    select s.status::text
    from shipping_shipments s
    where s.order_id = ${orderIdColumn}
    order by s.created_at desc nulls last
    limit 1
  )`;
}

export function latestReturnStatusSql(orderIdColumn: SQLWrapper): SQL {
  return sql`(
    select rr.status::text
    from return_requests rr
    where rr.order_id = ${orderIdColumn}
    order by rr.created_at desc nulls last
    limit 1
  )`;
}

function normalizeStatus(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isPackedShippingStatus(value: string | null): boolean {
  return (
    value === 'queued' ||
    value === 'creating_label' ||
    value === 'label_created' ||
    value === 'needs_attention'
  );
}

function isPackedShipmentStatus(value: string | null): boolean {
  return (
    value === 'queued' ||
    value === 'processing' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'needs_attention'
  );
}

function isReturnedStatus(value: string | null): boolean {
  return value === 'received' || value === 'refunded';
}

function isCanceledOrderStatus(value: string | null): boolean {
  return value === 'CANCELED' || value === 'INVENTORY_FAILED';
}

export async function readCanonicalFulfillmentSignals(
  dbClient: typeof db,
  orderId: string
): Promise<FulfillmentStageSignals> {
  const [shipmentRow] = await dbClient
    .select({ status: shippingShipments.status })
    .from(shippingShipments)
    .where(eq(shippingShipments.orderId, orderId))
    .orderBy(desc(shippingShipments.createdAt))
    .limit(1);

  const [returnRow] = await dbClient
    .select({ status: returnRequests.status })
    .from(returnRequests)
    .where(eq(returnRequests.orderId, orderId))
    .orderBy(desc(returnRequests.createdAt))
    .limit(1);

  return {
    shipmentStatus: shipmentRow?.status ?? null,
    returnStatus: returnRow?.status ?? null,
  };
}

export function deriveCanonicalFulfillmentStage(
  input: CanonicalFulfillmentStageInput
): CanonicalFulfillmentStage {
  const orderStatus = normalizeStatus(input.orderStatus);
  const shippingStatus = normalizeStatus(input.shippingStatus);
  const shipmentStatus = normalizeStatus(input.shipmentStatus);
  const returnStatus = normalizeStatus(input.returnStatus);

  if (isReturnedStatus(returnStatus)) {
    return 'returned';
  }

  if (isCanceledOrderStatus(orderStatus) || shippingStatus === 'cancelled') {
    return 'canceled';
  }

  if (shippingStatus === 'delivered') {
    return 'delivered';
  }

  if (shippingStatus === 'shipped') {
    return 'shipped';
  }

  if (
    isPackedShippingStatus(shippingStatus) ||
    isPackedShipmentStatus(shipmentStatus)
  ) {
    return 'packed';
  }

  return 'processing';
}
