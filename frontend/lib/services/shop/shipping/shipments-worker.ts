import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { getNovaPoshtaConfig, NovaPoshtaConfigError } from '@/lib/env/nova-poshta';
import { logInfo, logWarn } from '@/lib/logging';
import {
  createInternetDocument,
  NovaPoshtaApiError,
  type NovaPoshtaCreateTtnInput,
} from '@/lib/services/shop/shipping/nova-poshta-client';
import { sanitizeShippingErrorMessage } from '@/lib/services/shop/shipping/log-sanitizer';
import { recordShippingMetric } from '@/lib/services/shop/shipping/metrics';

type ClaimedShipmentRow = {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  attempt_count: number;
};

type OrderShippingDetailsRow = {
  order_id: string;
  currency: string;
  total_amount_minor: number;
  shipping_required: boolean | null;
  shipping_provider: string | null;
  shipping_method_code: string | null;
  shipping_address: unknown;
};

type ParsedShipmentSnapshot = {
  methodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
  cityRef: string;
  warehouseRef: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  recipientFullName: string;
  recipientPhone: string;
};

type ShipmentError = {
  code: string;
  message: string;
  transient: boolean;
};

export type RunShippingShipmentsWorkerArgs = {
  runId: string;
  leaseSeconds: number;
  limit: number;
  maxAttempts: number;
  baseBackoffSeconds: number;
};

export type RunShippingShipmentsWorkerResult = {
  claimed: number;
  processed: number;
  succeeded: number;
  retried: number;
  needsAttention: number;
};

const SHIPPING_METHOD_TO_SERVICE_TYPE: Record<
  ParsedShipmentSnapshot['methodCode'],
  NovaPoshtaCreateTtnInput['serviceType']
> = {
  NP_WAREHOUSE: 'WarehouseWarehouse',
  NP_LOCKER: 'WarehouseWarehouse',
  NP_COURIER: 'WarehouseDoors',
};

function readRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const anyRes = res as { rows?: unknown };
  if (Array.isArray(anyRes?.rows)) return anyRes.rows as T[];
  return [];
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asShipmentError(
  error: unknown,
  fallback: ShipmentError
): ShipmentError {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    'transient' in error &&
    typeof (error as { transient?: unknown }).transient === 'boolean'
  ) {
    const e = error as { code: string; message?: unknown; transient: boolean };
    return {
      code: e.code,
      message: typeof e.message === 'string' ? e.message : fallback.message,
      transient: e.transient,
    };
  }

  if (error instanceof NovaPoshtaConfigError) {
    return {
      code: 'NP_CONFIG_ERROR',
      message: 'Nova Poshta configuration is invalid.',
      transient: false,
    };
  }

  if (error instanceof NovaPoshtaApiError) {
    if (error.code === 'NP_HTTP_ERROR' || error.code === 'NP_INVALID_JSON') {
      return {
        code: error.code,
        message: 'Nova Poshta temporary API error.',
        transient: true,
      };
    }

    return {
      code: error.code || 'NP_API_ERROR',
      message: 'Nova Poshta API request failed.',
      transient: true,
    };
  }

  return fallback;
}

function buildFailure(
  code: string,
  message: string,
  transient: boolean
): ShipmentError {
  return { code, message, transient };
}

function parseSnapshot(raw: unknown): ParsedShipmentSnapshot {
  const root = toObject(raw);
  if (!root) {
    throw buildFailure(
      'SHIPPING_SNAPSHOT_MISSING',
      'Shipping snapshot is missing.',
      false
    );
  }

  const methodCode = toStringOrNull(root.methodCode);
  if (
    methodCode !== 'NP_WAREHOUSE' &&
    methodCode !== 'NP_LOCKER' &&
    methodCode !== 'NP_COURIER'
  ) {
    throw buildFailure(
      'SHIPPING_METHOD_UNSUPPORTED',
      'Shipping method is unsupported.',
      false
    );
  }

  const selection = toObject(root.selection);
  const recipient = toObject(root.recipient);
  if (!selection || !recipient) {
    throw buildFailure(
      'SHIPPING_SNAPSHOT_INVALID',
      'Shipping snapshot is invalid.',
      false
    );
  }

  const cityRef = toStringOrNull(selection.cityRef);
  const warehouseRef = toStringOrNull(selection.warehouseRef);
  const addressLine1 = toStringOrNull(selection.addressLine1);
  const addressLine2 = toStringOrNull(selection.addressLine2);

  const recipientFullName = toStringOrNull(recipient.fullName);
  const recipientPhone = toStringOrNull(recipient.phone);

  if (!cityRef || !recipientFullName || !recipientPhone) {
    throw buildFailure(
      'SHIPPING_SNAPSHOT_INVALID',
      'Shipping snapshot is invalid.',
      false
    );
  }

  if ((methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER') && !warehouseRef) {
    throw buildFailure(
      'SHIPPING_SNAPSHOT_INVALID',
      'warehouseRef is required for selected shipping method.',
      false
    );
  }

  if (methodCode === 'NP_COURIER' && !addressLine1) {
    throw buildFailure(
      'SHIPPING_SNAPSHOT_INVALID',
      'addressLine1 is required for courier shipping method.',
      false
    );
  }

  return {
    methodCode,
    cityRef,
    warehouseRef,
    addressLine1,
    addressLine2,
    recipientFullName,
    recipientPhone,
  };
}

function declaredCostUahFromMinor(totalMinor: number): number {
  if (!Number.isFinite(totalMinor) || totalMinor < 0) {
    throw buildFailure(
      'DECLARED_COST_INVALID',
      'Order amount is invalid for shipment declared cost.',
      false
    );
  }

  return Math.floor((Math.trunc(totalMinor) + 50) / 100);
}

function computeBackoffSeconds(attemptCount: number, baseBackoffSeconds: number): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 8));
  const exponential = Math.pow(2, cappedAttempt - 1);
  const backoff = baseBackoffSeconds * exponential;
  return Math.min(backoff, 6 * 60 * 60);
}

function toNpPayload(args: {
  order: OrderShippingDetailsRow;
  snapshot: ParsedShipmentSnapshot;
}): NovaPoshtaCreateTtnInput {
  const config = getNovaPoshtaConfig();
  if (!config.enabled || !config.sender) {
    throw new NovaPoshtaConfigError('Nova Poshta shipping is not configured');
  }

  if (args.order.currency !== 'UAH') {
    throw buildFailure(
      'NP_CURRENCY_UNSUPPORTED',
      'Nova Poshta supports only UAH orders.',
      false
    );
  }

  const declaredCostUah = declaredCostUahFromMinor(args.order.total_amount_minor);
  const serviceType = SHIPPING_METHOD_TO_SERVICE_TYPE[args.snapshot.methodCode];

  return {
    payerType: 'Recipient',
    paymentMethod: 'Cash',
    cargoType: config.defaultCargoType,
    serviceType,
    seatsAmount: 1,
    weightKg: Math.max(0.001, config.defaultWeightGrams / 1000),
    description: `DevLovers order ${args.order.order_id}`,
    declaredCostUah,
    sender: {
      cityRef: config.sender.cityRef,
      senderRef: config.sender.senderRef,
      warehouseRef: config.sender.warehouseRef,
      contactRef: config.sender.contactRef,
      phone: config.sender.phone,
    },
    recipient: {
      cityRef: args.snapshot.cityRef,
      warehouseRef: args.snapshot.warehouseRef,
      addressLine1: args.snapshot.addressLine1,
      addressLine2: args.snapshot.addressLine2,
      fullName: args.snapshot.recipientFullName,
      phone: args.snapshot.recipientPhone,
    },
  };
}

export async function claimQueuedShipmentsForProcessing(args: {
  runId: string;
  leaseSeconds: number;
  limit: number;
}): Promise<ClaimedShipmentRow[]> {
  const res = await db.execute<ClaimedShipmentRow>(sql`
    with candidates as (
      select s.id
      from shipping_shipments s
      where (
        (
          s.status in ('queued', 'failed')
          and (s.next_attempt_at is null or s.next_attempt_at <= now())
        )
        or s.status = 'processing'
      )
      and (s.lease_expires_at is null or s.lease_expires_at < now())
      order by coalesce(s.next_attempt_at, s.created_at) asc, s.created_at asc
      for update skip locked
      limit ${args.limit}
    ),
    claimed as (
      update shipping_shipments s
      set status = 'processing',
          lease_owner = ${args.runId},
          lease_expires_at = now() + make_interval(secs => ${args.leaseSeconds}),
          updated_at = now()
      where s.id in (select id from candidates)
      returning
        s.id,
        s.order_id,
        s.provider,
        s.status,
        s.attempt_count
    ),
    mark_orders as (
      update orders o
      set shipping_status = 'creating_label',
          updated_at = now()
      where o.id in (select order_id from claimed)
        and (
          o.shipping_status is null
          or o.shipping_status in ('pending', 'queued', 'creating_label')
        )
      returning o.id
    )
    select * from claimed
  `);

  return readRows<ClaimedShipmentRow>(res);
}

async function loadOrderShippingDetails(orderId: string): Promise<OrderShippingDetailsRow | null> {
  const res = await db.execute<OrderShippingDetailsRow>(sql`
    select
      o.id as order_id,
      o.currency as currency,
      o.total_amount_minor as total_amount_minor,
      o.shipping_required as shipping_required,
      o.shipping_provider as shipping_provider,
      o.shipping_method_code as shipping_method_code,
      os.shipping_address as shipping_address
    from orders o
    left join order_shipping os on os.order_id = o.id
    where o.id = ${orderId}::uuid
    limit 1
  `);

  return readRows<OrderShippingDetailsRow>(res)[0] ?? null;
}

async function markSucceeded(args: {
  shipmentId: string;
  runId: string;
  providerRef: string;
  trackingNumber: string;
}) {
  const res = await db.execute<{ order_id: string }>(sql`
    with updated_shipment as (
      update shipping_shipments s
      set status = 'succeeded',
          attempt_count = s.attempt_count + 1,
          provider_ref = ${args.providerRef},
          tracking_number = ${args.trackingNumber},
          last_error_code = null,
          last_error_message = null,
          next_attempt_at = null,
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where s.id = ${args.shipmentId}::uuid
        and s.lease_owner = ${args.runId}
      returning s.order_id
    ),
    updated_order as (
      update orders o
      set shipping_status = 'label_created',
          tracking_number = ${args.trackingNumber},
          shipping_provider_ref = ${args.providerRef},
          updated_at = now()
      where o.id in (select order_id from updated_shipment)
      returning o.id
    )
    select order_id from updated_shipment
  `);

  return readRows<{ order_id: string }>(res)[0] ?? null;
}

async function markFailed(args: {
  shipmentId: string;
  runId: string;
  orderId: string;
  error: ShipmentError;
  nextAttemptAt: Date | null;
  terminalNeedsAttention: boolean;
}) {
  const safeErrorMessage = sanitizeShippingErrorMessage(
    args.error.message,
    'Shipment processing failed.'
  );

  await db.execute(sql`
    with updated_shipment as (
      update shipping_shipments s
      set status = ${args.terminalNeedsAttention ? 'needs_attention' : 'failed'},
          attempt_count = s.attempt_count + 1,
          last_error_code = ${args.error.code},
          last_error_message = ${safeErrorMessage},
          next_attempt_at = ${args.nextAttemptAt},
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where s.id = ${args.shipmentId}::uuid
        and s.lease_owner = ${args.runId}
      returning s.order_id
    ),
    updated_order as (
      update orders o
      set shipping_status = ${args.terminalNeedsAttention ? 'needs_attention' : 'queued'},
          updated_at = now()
      where o.id = ${args.orderId}::uuid
        and exists (select 1 from updated_shipment)
      returning o.id
    )
    select 1
  `);
}

async function processClaimedShipment(args: {
  claim: ClaimedShipmentRow;
  runId: string;
  maxAttempts: number;
  baseBackoffSeconds: number;
}): Promise<'succeeded' | 'retried' | 'needs_attention'> {
  const details = await loadOrderShippingDetails(args.claim.order_id);
  if (!details) {
    await markFailed({
      shipmentId: args.claim.id,
      runId: args.runId,
      orderId: args.claim.order_id,
      error: buildFailure('ORDER_NOT_FOUND', 'Order was not found.', false),
      nextAttemptAt: null,
      terminalNeedsAttention: true,
    });
    return 'needs_attention';
  }

  try {
    if (details.shipping_required !== true) {
      throw buildFailure(
        'SHIPPING_NOT_REQUIRED',
        'Order does not require shipping.',
        false
      );
    }

    if (details.shipping_provider !== 'nova_poshta') {
      throw buildFailure(
        'SHIPPING_PROVIDER_UNSUPPORTED',
        'Shipping provider is unsupported.',
        false
      );
    }

    if (!details.shipping_method_code) {
      throw buildFailure(
        'SHIPPING_METHOD_MISSING',
        'Shipping method is missing.',
        false
      );
    }

    const parsedSnapshot = parseSnapshot(details.shipping_address);
    const payload = toNpPayload({
      order: details,
      snapshot: parsedSnapshot,
    });

    const created = await createInternetDocument(payload);

    await markSucceeded({
      shipmentId: args.claim.id,
      runId: args.runId,
      providerRef: created.providerRef,
      trackingNumber: created.trackingNumber,
    });

    recordShippingMetric({
      name: 'succeeded',
      source: 'shipments_worker',
      runId: args.runId,
      orderId: args.claim.order_id,
      shipmentId: args.claim.id,
    });

    return 'succeeded';
  } catch (error) {
    const classified = asShipmentError(error, {
      code: 'INTERNAL_ERROR',
      message: 'Internal shipment processing error.',
      transient: true,
    });

    const nextAttemptCount = Math.max(0, args.claim.attempt_count) + 1;
    const reachedMaxAttempts = nextAttemptCount >= args.maxAttempts;
    const terminalNeedsAttention = !classified.transient || reachedMaxAttempts;
    const nextAttemptAt = terminalNeedsAttention
      ? null
      : new Date(
          Date.now() +
            computeBackoffSeconds(nextAttemptCount, args.baseBackoffSeconds) * 1000
        );

    await markFailed({
      shipmentId: args.claim.id,
      runId: args.runId,
      orderId: args.claim.order_id,
      error: classified,
      nextAttemptAt,
      terminalNeedsAttention,
    });

    if (terminalNeedsAttention) {
      recordShippingMetric({
        name: 'needs_attention',
        source: 'shipments_worker',
        runId: args.runId,
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        code: classified.code,
      });
    } else {
      recordShippingMetric({
        name: 'failed',
        source: 'shipments_worker',
        runId: args.runId,
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        code: classified.code,
      });
      recordShippingMetric({
        name: 'retries',
        source: 'shipments_worker',
        runId: args.runId,
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        code: classified.code,
      });
    }

    logWarn('shipping_shipments_worker_item_failed', {
      runId: args.runId,
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      code: classified.code,
      terminalNeedsAttention,
    });

    return terminalNeedsAttention ? 'needs_attention' : 'retried';
  }
}

export async function runShippingShipmentsWorker(
  args: RunShippingShipmentsWorkerArgs
): Promise<RunShippingShipmentsWorkerResult> {
  const claimed = await claimQueuedShipmentsForProcessing({
    runId: args.runId,
    leaseSeconds: args.leaseSeconds,
    limit: args.limit,
  });

  let processed = 0;
  let succeeded = 0;
  let retried = 0;
  let needsAttention = 0;

  for (const claim of claimed) {
    processed += 1;
    const outcome = await processClaimedShipment({
      claim,
      runId: args.runId,
      maxAttempts: args.maxAttempts,
      baseBackoffSeconds: args.baseBackoffSeconds,
    });

    if (outcome === 'succeeded') succeeded += 1;
    else if (outcome === 'retried') retried += 1;
    else needsAttention += 1;
  }

  logInfo('shipping_shipments_worker_completed', {
    runId: args.runId,
    claimed: claimed.length,
    processed,
    succeeded,
    retried,
    needsAttention,
  });

  return {
    claimed: claimed.length,
    processed,
    succeeded,
    retried,
    needsAttention,
  };
}
