import 'server-only';

export const CANONICAL_FULFILLMENT_STAGES = [
  'processing',
  'packed',
  'shipped',
  'delivered',
  'canceled',
  'returned',
] as const;

export type CanonicalFulfillmentStage =
  (typeof CANONICAL_FULFILLMENT_STAGES)[number];

export type CanonicalFulfillmentStageInput = {
  orderStatus?: string | null | undefined;
  shippingStatus?: string | null | undefined;
  shipmentStatus?: string | null | undefined;
  returnStatus?: string | null | undefined;
};

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
