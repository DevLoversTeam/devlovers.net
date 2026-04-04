import 'server-only';

import crypto from 'node:crypto';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { shippingEvents } from '@/db/schema';
import {
  getNovaPoshtaConfig,
  NovaPoshtaConfigError,
} from '@/lib/env/nova-poshta';
import { logInfo, logWarn } from '@/lib/logging';
import { buildShippingEventDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import { writeShippingEvent } from '@/lib/services/shop/events/write-shipping-event';
import {
  evaluateOrderShippingEligibility,
  orderShippingEligibilityWhereSql,
} from '@/lib/services/shop/shipping/eligibility';
import { sanitizeShippingErrorMessage } from '@/lib/services/shop/shipping/log-sanitizer';
import { recordShippingMetric } from '@/lib/services/shop/shipping/metrics';
import {
  createInternetDocument,
  NovaPoshtaApiError,
  type NovaPoshtaCreateTtnInput,
} from '@/lib/services/shop/shipping/nova-poshta-client';
import { shippingStatusTransitionWhereSql } from '@/lib/services/shop/transitions/shipping-state';

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
  payment_status: string | null;
  status: string | null;
  inventory_status: string | null;
  psp_status_reason: string | null;
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

type WorkerShippingEventName =
  | 'creating_label'
  | 'label_created'
  | 'label_creation_retry_scheduled'
  | 'label_creation_needs_attention';

type CanonicalCarrierCreatePayload = {
  payerType: NovaPoshtaCreateTtnInput['payerType'];
  paymentMethod: NovaPoshtaCreateTtnInput['paymentMethod'];
  cargoType: string;
  serviceType: NovaPoshtaCreateTtnInput['serviceType'];
  seatsAmount: number;
  weightGrams: number;
  description: string;
  declaredCostUah: number;
  sender: {
    cityRef: string;
    senderRef: string;
    warehouseRef: string;
    contactRef: string;
    phone: string;
  };
  recipient: {
    cityRef: string;
    warehouseRef: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    fullName: string;
    phone: string;
  };
};

type CarrierCreatePayloadIdentity = {
  canonicalPayload: CanonicalCarrierCreatePayload;
  canonicalHash: string;
};

const INTERNAL_CARRIER_EVENT_SOURCE = 'shipments_worker_internal';
const INTERNAL_CARRIER_CREATE_REQUESTED_EVENT =
  'carrier_create_requested_internal';
const INTERNAL_CARRIER_CREATE_SUCCEEDED_EVENT =
  'carrier_create_succeeded_internal';

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

const PERMANENT_NP_ERROR_CODES = new Set<string>([
  'NP_VALIDATION_ERROR',
  'NP_ADDRESS_INVALID',
  'NP_CITY_INVALID',
  'NP_CITY_REF_INVALID',
  'NP_WAREHOUSE_INVALID',
  'NP_WAREHOUSE_REF_INVALID',
  'NP_RECIPIENT_INVALID',
  'NP_RECIPIENT_NAME_INVALID',
  'NP_RECIPIENT_PHONE_INVALID',
  'NP_PHONE_INVALID',
]);

function isPermanentNovaPoshtaErrorCode(
  code: string | null | undefined
): boolean {
  if (!code) return false;
  return PERMANENT_NP_ERROR_CODES.has(code);
}

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
    if (isPermanentNovaPoshtaErrorCode(error.code)) {
      return {
        code: error.code,
        message: 'Nova Poshta rejected shipment data.',
        transient: false,
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

  if (
    (methodCode === 'NP_WAREHOUSE' || methodCode === 'NP_LOCKER') &&
    !warehouseRef
  ) {
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

  const MIN_NP_DECLARED_COST_UAH = 300;

  const rounded = Math.floor((Math.trunc(totalMinor) + 50) / 100);

  return Math.max(MIN_NP_DECLARED_COST_UAH, rounded);
}

function computeBackoffSeconds(
  attemptCount: number,
  baseBackoffSeconds: number
): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 8));
  const exponential = Math.pow(2, cappedAttempt - 1);
  const backoff = baseBackoffSeconds * exponential;
  return Math.min(backoff, 6 * 60 * 60);
}

function nextAttemptNumber(attemptCount: number): number {
  return Math.max(1, Math.max(0, Math.trunc(attemptCount)) + 1);
}

function buildWorkerEventDedupeKey(args: {
  orderId: string;
  shipmentId: string;
  eventName: WorkerShippingEventName;
  statusTo: string;
  attemptNumber: number;
  errorCode?: string | null;
}): string {
  return buildShippingEventDedupeKey({
    domain: 'shipments_worker',
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    eventName: args.eventName,
    statusTo: args.statusTo,
    attemptNumber: args.attemptNumber,
    errorCode: args.errorCode ?? null,
  });
}

function canonicalizeCarrierCreatePayload(
  requestPayload: NovaPoshtaCreateTtnInput
): CanonicalCarrierCreatePayload {
  const normalizedWeightGrams = Math.max(
    1,
    Math.round(requestPayload.weightKg * 1000)
  );

  return {
    payerType: requestPayload.payerType,
    paymentMethod: requestPayload.paymentMethod,
    cargoType: requestPayload.cargoType,
    serviceType: requestPayload.serviceType,
    seatsAmount: Math.max(1, Math.trunc(requestPayload.seatsAmount)),
    weightGrams: normalizedWeightGrams,
    description: requestPayload.description,
    declaredCostUah: Math.max(0, Math.trunc(requestPayload.declaredCostUah)),
    sender: {
      cityRef: requestPayload.sender.cityRef,
      senderRef: requestPayload.sender.senderRef,
      warehouseRef: requestPayload.sender.warehouseRef,
      contactRef: requestPayload.sender.contactRef,
      phone: requestPayload.sender.phone,
    },
    recipient: {
      cityRef: requestPayload.recipient.cityRef,
      warehouseRef: requestPayload.recipient.warehouseRef ?? null,
      addressLine1: requestPayload.recipient.addressLine1 ?? null,
      addressLine2: requestPayload.recipient.addressLine2 ?? null,
      fullName: requestPayload.recipient.fullName,
      phone: requestPayload.recipient.phone,
    },
  };
}

export function buildCarrierCreatePayloadIdentity(
  requestPayload: NovaPoshtaCreateTtnInput
): CarrierCreatePayloadIdentity {
  const canonicalPayload = canonicalizeCarrierCreatePayload(requestPayload);
  const canonicalHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf8')
    .digest('hex');

  return {
    canonicalPayload,
    canonicalHash,
  };
}

function buildCarrierCreateIntentSeed(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
}) {
  return {
    domain: 'carrier_create',
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    provider: args.provider,
  };
}

function buildCarrierCreateRequestedDedupeKey(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
}): string {
  return buildShippingEventDedupeKey({
    ...buildCarrierCreateIntentSeed(args),
    phase: 'requested',
  });
}

function buildCarrierCreateSucceededDedupeKey(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
}): string {
  return buildShippingEventDedupeKey({
    ...buildCarrierCreateIntentSeed(args),
    phase: 'succeeded',
  });
}

type PersistedCarrierCreateSuccess = {
  providerRef: string;
  trackingNumber: string;
  canonicalHash: string | null;
};

type PersistedCarrierCreateRequest = {
  canonicalHash: string | null;
};

function readCanonicalHashFromPayload(payload: unknown): string | null {
  const payloadObject = toObject(payload);
  return toStringOrNull(payloadObject?.canonicalHash);
}

async function readPersistedCarrierCreateRequest(args: {
  shipmentId: string;
}): Promise<PersistedCarrierCreateRequest | null> {
  const [row] = await db
    .select({
      payload: shippingEvents.payload,
    })
    .from(shippingEvents)
    .where(
      and(
        eq(shippingEvents.shipmentId, args.shipmentId),
        eq(shippingEvents.eventSource, INTERNAL_CARRIER_EVENT_SOURCE),
        eq(shippingEvents.eventName, INTERNAL_CARRIER_CREATE_REQUESTED_EVENT)
      )
    )
    .orderBy(desc(shippingEvents.occurredAt), desc(shippingEvents.id))
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    canonicalHash: readCanonicalHashFromPayload(row.payload),
  };
}

type CarrierCreateAttemptResolution =
  | {
      outcome: 'call_carrier';
    }
  | {
      outcome: 'replay_success';
      success: PersistedCarrierCreateSuccess;
    }
  | {
      outcome: 'block_retry';
    }
  | {
      outcome: 'payload_drift';
    }
  | {
      outcome: 'success_conflict';
    };

type PersistedCarrierCreateSuccessState =
  | {
      state: 'none';
    }
  | {
      state: 'single';
      success: PersistedCarrierCreateSuccess;
    }
  | {
      state: 'conflict';
    };

function buildShipmentSuccessOutcomeKey(args: {
  providerRef: string;
  trackingNumber: string;
}): string {
  return `${args.providerRef}::${args.trackingNumber}`;
}

function isPartiallyPopulatedOutcome(args: {
  providerRef: string | null;
  trackingNumber: string | null;
}): boolean {
  return Boolean(args.providerRef) !== Boolean(args.trackingNumber);
}

async function readPersistedCarrierCreateSuccessState(args: {
  shipmentId: string;
}): Promise<PersistedCarrierCreateSuccessState> {
  const successEvents = await db
    .select({
      providerRef: shippingEvents.eventRef,
      trackingNumber: shippingEvents.trackingNumber,
      payload: shippingEvents.payload,
    })
    .from(shippingEvents)
    .where(
      and(
        eq(shippingEvents.shipmentId, args.shipmentId),
        eq(shippingEvents.eventSource, INTERNAL_CARRIER_EVENT_SOURCE),
        eq(shippingEvents.eventName, INTERNAL_CARRIER_CREATE_SUCCEEDED_EVENT)
      )
    )
    .orderBy(desc(shippingEvents.occurredAt), desc(shippingEvents.id));

  const stateRows = readRows<{
    shipment_provider_ref: string | null;
    shipment_tracking_number: string | null;
    order_provider_ref: string | null;
    order_tracking_number: string | null;
  }>(
    await db.execute(sql`
    select
      s.provider_ref as shipment_provider_ref,
      s.tracking_number as shipment_tracking_number,
      o.shipping_provider_ref as order_provider_ref,
      o.tracking_number as order_tracking_number
    from shipping_shipments s
    join orders o on o.id = s.order_id
    where s.id = ${args.shipmentId}::uuid
    limit 1
  `)
  );

  const stateRow = stateRows[0];
  const outcomes = new Map<string, PersistedCarrierCreateSuccess>();

  const rememberOutcome = (candidate: PersistedCarrierCreateSuccess | null) => {
    if (!candidate) return;
    outcomes.set(buildShipmentSuccessOutcomeKey(candidate), candidate);
  };

  for (const row of successEvents) {
    const providerRef = toStringOrNull(row.providerRef);
    const trackingNumber = toStringOrNull(row.trackingNumber);
    if (!providerRef || !trackingNumber) {
      return { state: 'conflict' };
    }
    rememberOutcome({
      providerRef,
      trackingNumber,
      canonicalHash: readCanonicalHashFromPayload(row.payload),
    });
  }

  const shipmentProviderRef = toStringOrNull(stateRow?.shipment_provider_ref);
  const shipmentTrackingNumber = toStringOrNull(
    stateRow?.shipment_tracking_number
  );
  if (
    isPartiallyPopulatedOutcome({
      providerRef: shipmentProviderRef,
      trackingNumber: shipmentTrackingNumber,
    })
  ) {
    return { state: 'conflict' };
  }
  if (shipmentProviderRef && shipmentTrackingNumber) {
    rememberOutcome({
      providerRef: shipmentProviderRef,
      trackingNumber: shipmentTrackingNumber,
      canonicalHash: null,
    });
  }

  const orderProviderRef = toStringOrNull(stateRow?.order_provider_ref);
  const orderTrackingNumber = toStringOrNull(stateRow?.order_tracking_number);
  if (
    isPartiallyPopulatedOutcome({
      providerRef: orderProviderRef,
      trackingNumber: orderTrackingNumber,
    })
  ) {
    return { state: 'conflict' };
  }
  if (orderProviderRef && orderTrackingNumber) {
    rememberOutcome({
      providerRef: orderProviderRef,
      trackingNumber: orderTrackingNumber,
      canonicalHash: null,
    });
  }

  if (outcomes.size === 0) {
    return { state: 'none' };
  }
  if (outcomes.size > 1) {
    return { state: 'conflict' };
  }

  return {
    state: 'single',
    success: Array.from(outcomes.values())[0] as PersistedCarrierCreateSuccess,
  };
}

async function resolveCarrierCreateAttempt(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
  payloadIdentity: CarrierCreatePayloadIdentity;
}): Promise<CarrierCreateAttemptResolution> {
  const persistedSuccessState = await readPersistedCarrierCreateSuccessState({
    shipmentId: args.shipmentId,
  });
  if (persistedSuccessState.state === 'conflict') {
    return { outcome: 'success_conflict' };
  }
  if (persistedSuccessState.state === 'single') {
    return {
      outcome: 'replay_success',
      success: persistedSuccessState.success,
    };
  }

  const requestedIntent = await readPersistedCarrierCreateRequest({
    shipmentId: args.shipmentId,
  });
  if (requestedIntent) {
    if (
      requestedIntent.canonicalHash &&
      requestedIntent.canonicalHash !== args.payloadIdentity.canonicalHash
    ) {
      return { outcome: 'payload_drift' };
    }
    return { outcome: 'block_retry' };
  }

  const dedupeKey = buildCarrierCreateRequestedDedupeKey(args);
  const requested = await writeShippingEvent({
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    provider: args.provider,
    eventName: INTERNAL_CARRIER_CREATE_REQUESTED_EVENT,
    eventSource: INTERNAL_CARRIER_EVENT_SOURCE,
    payload: {
      canonicalHash: args.payloadIdentity.canonicalHash,
      canonicalPayload: args.payloadIdentity.canonicalPayload,
    },
    dedupeKey,
  });

  if (requested.inserted) {
    return { outcome: 'call_carrier' };
  }

  const persistedSuccessAfterConflict =
    await readPersistedCarrierCreateSuccessState({
      shipmentId: args.shipmentId,
    });
  if (persistedSuccessAfterConflict.state === 'conflict') {
    return { outcome: 'success_conflict' };
  }
  if (persistedSuccessAfterConflict.state === 'single') {
    return {
      outcome: 'replay_success',
      success: persistedSuccessAfterConflict.success,
    };
  }

  const requestedIntentAfterConflict = await readPersistedCarrierCreateRequest({
    shipmentId: args.shipmentId,
  });
  if (
    requestedIntentAfterConflict?.canonicalHash &&
    requestedIntentAfterConflict.canonicalHash !==
      args.payloadIdentity.canonicalHash
  ) {
    return { outcome: 'payload_drift' };
  }

  return { outcome: 'block_retry' };
}

async function persistCarrierCreateSuccess(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
  payloadIdentity: CarrierCreatePayloadIdentity;
  providerRef: string;
  trackingNumber: string;
}) {
  await writeShippingEvent({
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    provider: args.provider,
    eventName: INTERNAL_CARRIER_CREATE_SUCCEEDED_EVENT,
    eventSource: INTERNAL_CARRIER_EVENT_SOURCE,
    eventRef: args.providerRef,
    trackingNumber: args.trackingNumber,
    payload: {
      canonicalHash: args.payloadIdentity.canonicalHash,
      canonicalPayload: args.payloadIdentity.canonicalPayload,
      providerRef: args.providerRef,
      trackingNumber: args.trackingNumber,
    },
    dedupeKey: buildCarrierCreateSucceededDedupeKey(args),
  });
}

async function emitWorkerShippingEvent(args: {
  orderId: string;
  shipmentId: string;
  provider: string;
  eventName: WorkerShippingEventName;
  statusFrom: string | null;
  statusTo: string;
  attemptNumber: number;
  runId: string;
  payload?: Record<string, unknown>;
  eventRef?: string | null;
  trackingNumber?: string | null;
  errorCode?: string | null;
}) {
  const dedupeKey = buildWorkerEventDedupeKey({
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    eventName: args.eventName,
    statusTo: args.statusTo,
    attemptNumber: args.attemptNumber,
    errorCode: args.errorCode ?? null,
  });

  await writeShippingEvent({
    orderId: args.orderId,
    shipmentId: args.shipmentId,
    provider: args.provider,
    eventName: args.eventName,
    eventSource: 'shipments_worker',
    eventRef: args.eventRef ?? args.runId,
    statusFrom: args.statusFrom,
    statusTo: args.statusTo,
    trackingNumber: args.trackingNumber ?? null,
    payload: {
      ...(args.payload ?? {}),
      runId: args.runId,
      attemptNumber: args.attemptNumber,
    },
    dedupeKey,
  });
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

  const declaredCostUah = declaredCostUahFromMinor(
    args.order.total_amount_minor
  );
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
      select
        s.id,
        s.order_id,
        s.status as candidate_status
      from shipping_shipments s
      join orders o on o.id = s.order_id
      where (
        (
          s.status in ('queued', 'failed')
          and (s.next_attempt_at is null or s.next_attempt_at <= now())
          and ${orderShippingEligibilityWhereSql({
            paymentStatusColumn: sql`o.payment_status`,
            orderStatusColumn: sql`o.status`,
            inventoryStatusColumn: sql`o.inventory_status`,
            pspStatusReasonColumn: sql`o.psp_status_reason`,
          })}
          and ${shippingStatusTransitionWhereSql({
            column: sql`o.shipping_status`,
            to: 'creating_label',
            allowNullFrom: true,
            includeSame: true,
          })}
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
      from candidates c
      where s.id = c.id
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
        and ${shippingStatusTransitionWhereSql({
          column: sql`o.shipping_status`,
          to: 'creating_label',
          allowNullFrom: true,
          includeSame: true,
        })}
      returning o.id as order_id
    ),
    released_blocked as (
      update shipping_shipments s
      set status = 'queued',
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      from claimed c
      left join mark_orders mo on mo.order_id = c.order_id
      where s.id = c.id
        and mo.order_id is null
      returning s.id
    )
    select
      c.id,
      c.order_id,
      c.provider,
      c.status,
      c.attempt_count
    from claimed c
join mark_orders mo on mo.order_id = c.order_id
  `);

  const claimed = readRows<ClaimedShipmentRow>(res);

  for (const row of claimed) {
    try {
      await emitWorkerShippingEvent({
        orderId: row.order_id,
        shipmentId: row.id,
        provider: row.provider,
        eventName: 'creating_label',
        statusFrom: null,
        statusTo: 'creating_label',
        attemptNumber: nextAttemptNumber(row.attempt_count),
        runId: args.runId,
        payload: {
          shipmentStatusTo: 'processing',
        },
      });
    } catch (error) {
      logWarn('shipping_shipments_worker_claim_event_write_failed', {
        runId: args.runId,
        orderId: row.order_id,
        shipmentId: row.id,
        provider: row.provider,
        eventName: 'creating_label',
        code: 'SHIPPING_EVENT_WRITE_FAILED',
        ...(error instanceof Error && error.message
          ? { errorMessage: error.message }
          : {}),
      });
    }
  }

  return claimed;
}

async function loadOrderShippingDetails(
  orderId: string
): Promise<OrderShippingDetailsRow | null> {
  const res = await db.execute<OrderShippingDetailsRow>(sql`
    select
      o.id as order_id,
      o.currency as currency,
      o.total_amount_minor as total_amount_minor,
      o.payment_status as payment_status,
      o.status as status,
      o.inventory_status as inventory_status,
      o.psp_status_reason as psp_status_reason,
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

async function loadAuthoritativeCarrierCreateIntent(args: {
  orderId: string;
}): Promise<{
  details: OrderShippingDetailsRow;
  snapshot: ParsedShipmentSnapshot;
  requestPayload: NovaPoshtaCreateTtnInput;
  payloadIdentity: CarrierCreatePayloadIdentity;
}> {
  const details = await loadOrderShippingDetails(args.orderId);
  if (!details) {
    throw buildFailure('ORDER_NOT_FOUND', 'Order was not found.', false);
  }

  assertOrderStillShippable(details);

  const snapshot = parseSnapshot(details.shipping_address);
  if (snapshot.methodCode !== details.shipping_method_code) {
    throw buildFailure(
      'SHIPPING_METHOD_MISMATCH',
      'Shipping method does not match persisted order method.',
      false
    );
  }

  const requestPayload = toNpPayload({
    order: details,
    snapshot,
  });

  return {
    details,
    snapshot,
    requestPayload,
    payloadIdentity: buildCarrierCreatePayloadIdentity(requestPayload),
  };
}

function assertOrderStillShippable(details: OrderShippingDetailsRow) {
  const eligibility = evaluateOrderShippingEligibility({
    paymentStatus: details.payment_status,
    orderStatus: details.status,
    inventoryStatus: details.inventory_status,
    pspStatusReason: details.psp_status_reason,
  });
  if (!eligibility.ok) {
    throw buildFailure('ORDER_NOT_SHIPPABLE', eligibility.message, false);
  }

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
}

async function markSucceeded(args: {
  shipmentId: string;
  runId: string;
  providerRef: string;
  trackingNumber: string;
}) {
  const res = await db.execute<{
    shipment_updated: boolean;
    order_updated: boolean;
    order_id: string | null;
  }>(sql`
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
      from orders o
      where s.id = ${args.shipmentId}::uuid
        and s.lease_owner = ${args.runId}
        and o.id = s.order_id
        and ${orderShippingEligibilityWhereSql({
          paymentStatusColumn: sql`o.payment_status`,
          orderStatusColumn: sql`o.status`,
          inventoryStatusColumn: sql`o.inventory_status`,
          pspStatusReasonColumn: sql`o.psp_status_reason`,
        })}
        and ${shippingStatusTransitionWhereSql({
          column: sql`o.shipping_status`,
          to: 'label_created',
          allowNullFrom: true,
        })}
      returning s.order_id
    ),
    updated_order as (
      update orders o
      set shipping_status = 'label_created',
          tracking_number = ${args.trackingNumber},
          shipping_provider_ref = ${args.providerRef},
          updated_at = now()
      where o.id in (select order_id from updated_shipment)
        and ${shippingStatusTransitionWhereSql({
          column: sql`o.shipping_status`,
          to: 'label_created',
          allowNullFrom: true,
        })}
      returning o.id
    )
    select
      exists (select 1 from updated_shipment) as shipment_updated,
      exists (select 1 from updated_order) as order_updated,
      (select us.order_id from updated_shipment us limit 1) as order_id
  `);

  return (
    readRows<{
      shipment_updated: boolean;
      order_updated: boolean;
      order_id: string | null;
    }>(res)[0] ?? null
  );
}

async function markFailed(args: {
  shipmentId: string;
  runId: string;
  orderId: string;
  error: ShipmentError;
  nextAttemptAt: Date | null;
  terminalNeedsAttention: boolean;
}): Promise<{ shipment_updated: boolean; order_updated: boolean } | null> {
  const safeErrorMessage = sanitizeShippingErrorMessage(
    args.error.message,
    'Shipment processing failed.'
  );

  const res = await db.execute<{
    shipment_updated: boolean;
    order_updated: boolean;
  }>(sql`
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
        and ${shippingStatusTransitionWhereSql({
          column: sql`o.shipping_status`,
          to: args.terminalNeedsAttention ? 'needs_attention' : 'queued',
          allowNullFrom: true,
          includeSame: true,
        })}
      returning o.id
    )
    select
      exists (select 1 from updated_shipment) as shipment_updated,
      exists (select 1 from updated_order) as order_updated
  `);

  return (
    readRows<{
      shipment_updated: boolean;
      order_updated: boolean;
    }>(res)[0] ?? null
  );
}

async function markNeedsAttentionAfterSucceeded(args: {
  shipmentId: string;
  orderId: string;
  error: ShipmentError;
}): Promise<{ shipment_updated: boolean; order_updated: boolean } | null> {
  const safeErrorMessage = sanitizeShippingErrorMessage(
    args.error.message,
    'Shipment processing failed.'
  );

  const res = await db.execute<{
    shipment_updated: boolean;
    order_updated: boolean;
  }>(sql`
    with updated_shipment as (
      update shipping_shipments s
      set status = 'needs_attention',
          last_error_code = ${args.error.code},
          last_error_message = ${safeErrorMessage},
          next_attempt_at = null,
          lease_owner = null,
          lease_expires_at = null,
          updated_at = now()
      where s.id = ${args.shipmentId}::uuid
        and s.status in ('succeeded', 'needs_attention')
      returning s.order_id
    ),
    updated_order as (
      update orders o
      set shipping_status = 'needs_attention',
          updated_at = now()
      where o.id = ${args.orderId}::uuid
        and exists (select 1 from updated_shipment)
        and ${shippingStatusTransitionWhereSql({
          column: sql`o.shipping_status`,
          to: 'needs_attention',
          allowNullFrom: true,
          includeSame: true,
        })}
      returning o.id
    )
    select
      exists (select 1 from updated_shipment) as shipment_updated,
      exists (select 1 from updated_order) as order_updated
  `);

  return (
    readRows<{
      shipment_updated: boolean;
      order_updated: boolean;
    }>(res)[0] ?? null
  );
}

async function finalizeShipmentSuccess(args: {
  claim: ClaimedShipmentRow;
  runId: string;
  providerRef: string;
  trackingNumber: string;
}): Promise<'succeeded' | 'retried' | 'needs_attention'> {
  const marked = await markSucceeded({
    shipmentId: args.claim.id,
    runId: args.runId,
    providerRef: args.providerRef,
    trackingNumber: args.trackingNumber,
  });

  if (!marked?.shipment_updated) {
    logWarn('shipping_shipments_worker_lease_lost', {
      runId: args.runId,
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      code: 'SHIPMENT_LEASE_LOST',
    });
    return 'retried';
  }
  if (!marked.order_updated) {
    logWarn('shipping_shipments_worker_order_transition_blocked', {
      runId: args.runId,
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      code: 'ORDER_TRANSITION_BLOCKED',
      statusTo: 'label_created',
    });

    const updated = await markNeedsAttentionAfterSucceeded({
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      error: buildFailure(
        'SHIPMENT_SUCCESS_APPLY_BLOCKED',
        'Shipment carrier success could not be applied because the order shipping transition was blocked.',
        false
      ),
    });

    if (!updated?.shipment_updated) {
      return 'retried';
    }

    try {
      await emitWorkerShippingEvent({
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        provider: args.claim.provider,
        eventName: 'label_creation_needs_attention',
        statusFrom: 'creating_label',
        statusTo: 'needs_attention',
        attemptNumber: nextAttemptNumber(args.claim.attempt_count),
        runId: args.runId,
        eventRef: 'SHIPMENT_SUCCESS_APPLY_BLOCKED',
        errorCode: 'SHIPMENT_SUCCESS_APPLY_BLOCKED',
        trackingNumber: args.trackingNumber,
        payload: {
          errorCode: 'SHIPMENT_SUCCESS_APPLY_BLOCKED',
          errorMessage:
            'Shipment carrier success could not be applied because the order shipping transition was blocked.',
          transient: false,
          nextAttemptAt: null,
          shipmentStatusTo: 'needs_attention',
          orderTransitionBlocked: true,
          providerRef: args.providerRef,
          trackingNumber: args.trackingNumber,
          carrierSuccessPersisted: true,
        },
      });
    } catch {
      logWarn('shipping_shipments_worker_failure_event_write_failed', {
        runId: args.runId,
        shipmentId: args.claim.id,
        orderId: args.claim.order_id,
        provider: args.claim.provider,
        code: 'SHIPPING_EVENT_WRITE_FAILED',
        eventName: 'label_creation_needs_attention',
      });
    }

    try {
      recordShippingMetric({
        name: 'needs_attention',
        source: 'shipments_worker',
        runId: args.runId,
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        code: 'SHIPMENT_SUCCESS_APPLY_BLOCKED',
      });
    } catch {
      logWarn('shipping_shipments_worker_terminal_metric_write_failed', {
        runId: args.runId,
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        errorCode: 'SHIPMENT_SUCCESS_APPLY_BLOCKED',
        code: 'SHIPPING_METRIC_WRITE_FAILED',
      });
    }

    return 'needs_attention';
  }

  try {
    await emitWorkerShippingEvent({
      orderId: args.claim.order_id,
      shipmentId: args.claim.id,
      provider: args.claim.provider,
      eventName: 'label_created',
      statusFrom: 'creating_label',
      statusTo: 'label_created',
      attemptNumber: nextAttemptNumber(args.claim.attempt_count),
      runId: args.runId,
      eventRef: args.providerRef,
      trackingNumber: args.trackingNumber,
      payload: {
        providerRef: args.providerRef,
        shipmentStatusTo: 'succeeded',
      },
    });
  } catch {
    logWarn('shipping_shipments_worker_post_success_event_write_failed', {
      runId: args.runId,
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      code: 'SHIPPING_EVENT_WRITE_FAILED',
    });
  }

  try {
    recordShippingMetric({
      name: 'succeeded',
      source: 'shipments_worker',
      runId: args.runId,
      orderId: args.claim.order_id,
      shipmentId: args.claim.id,
    });
  } catch {
    logWarn('shipping_shipments_worker_post_success_metric_write_failed', {
      runId: args.runId,
      shipmentId: args.claim.id,
      orderId: args.claim.order_id,
      code: 'SHIPPING_METRIC_WRITE_FAILED',
    });
  }

  return 'succeeded';
}

async function processClaimedShipment(args: {
  claim: ClaimedShipmentRow;
  runId: string;
  maxAttempts: number;
  baseBackoffSeconds: number;
}): Promise<'succeeded' | 'retried' | 'needs_attention'> {
  try {
    const carrierCreateIntent = await loadAuthoritativeCarrierCreateIntent({
      orderId: args.claim.order_id,
    });

    const carrierCreateAttempt = await resolveCarrierCreateAttempt({
      orderId: args.claim.order_id,
      shipmentId: args.claim.id,
      provider: args.claim.provider,
      payloadIdentity: carrierCreateIntent.payloadIdentity,
    });

    if (carrierCreateAttempt.outcome === 'replay_success') {
      return finalizeShipmentSuccess({
        claim: args.claim,
        runId: args.runId,
        providerRef: carrierCreateAttempt.success.providerRef,
        trackingNumber: carrierCreateAttempt.success.trackingNumber,
      });
    }

    if (carrierCreateAttempt.outcome === 'success_conflict') {
      throw buildFailure(
        'CARRIER_CREATE_SUCCESS_CONFLICT',
        'Conflicting shipment success outcomes were detected for this shipment intent.',
        false
      );
    }

    if (carrierCreateAttempt.outcome === 'payload_drift') {
      throw buildFailure(
        'CARRIER_CREATE_PAYLOAD_DRIFT',
        'Shipment create payload drift was detected for an existing carrier create intent.',
        false
      );
    }

    if (carrierCreateAttempt.outcome === 'block_retry') {
      throw buildFailure(
        'CARRIER_CREATE_RETRY_BLOCKED',
        'Previous shipment create attempt may already have reached the carrier boundary.',
        false
      );
    }

    const created = await createInternetDocument(
      carrierCreateIntent.requestPayload
    );

    await persistCarrierCreateSuccess({
      orderId: args.claim.order_id,
      shipmentId: args.claim.id,
      provider: args.claim.provider,
      payloadIdentity: carrierCreateIntent.payloadIdentity,
      providerRef: created.providerRef,
      trackingNumber: created.trackingNumber,
    });

    return finalizeShipmentSuccess({
      claim: args.claim,
      runId: args.runId,
      providerRef: created.providerRef,
      trackingNumber: created.trackingNumber,
    });
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
            computeBackoffSeconds(nextAttemptCount, args.baseBackoffSeconds) *
              1000
        );

    const updated = await markFailed({
      shipmentId: args.claim.id,
      runId: args.runId,
      orderId: args.claim.order_id,
      error: classified,
      nextAttemptAt,
      terminalNeedsAttention,
    });

    if (!updated?.shipment_updated) {
      logWarn('shipping_shipments_worker_lease_lost', {
        runId: args.runId,
        shipmentId: args.claim.id,
        orderId: args.claim.order_id,
        code: 'SHIPMENT_LEASE_LOST',
      });
      return 'retried';
    }
    const orderTransitionBlocked = !updated.order_updated;
    if (orderTransitionBlocked) {
      logWarn('shipping_shipments_worker_order_transition_blocked', {
        runId: args.runId,
        shipmentId: args.claim.id,
        orderId: args.claim.order_id,
        code: 'ORDER_TRANSITION_BLOCKED',
        statusTo: terminalNeedsAttention ? 'needs_attention' : 'queued',
      });
      if (!terminalNeedsAttention) {
        return 'retried';
      }
    }

    const failureEventName = terminalNeedsAttention
      ? 'label_creation_needs_attention'
      : 'label_creation_retry_scheduled';
    try {
      await emitWorkerShippingEvent({
        orderId: args.claim.order_id,
        shipmentId: args.claim.id,
        provider: args.claim.provider,
        eventName: failureEventName,
        statusFrom: 'creating_label',
        statusTo: terminalNeedsAttention ? 'needs_attention' : 'queued',
        attemptNumber: nextAttemptNumber(args.claim.attempt_count),
        runId: args.runId,
        eventRef: classified.code,
        errorCode: classified.code,
        payload: {
          errorCode: classified.code,
          errorMessage: classified.message,
          transient: classified.transient,
          nextAttemptAt: nextAttemptAt ? nextAttemptAt.toISOString() : null,
          shipmentStatusTo: terminalNeedsAttention
            ? 'needs_attention'
            : 'failed',
          orderTransitionBlocked: terminalNeedsAttention
            ? orderTransitionBlocked
            : undefined,
        },
      });
    } catch {
      logWarn('shipping_shipments_worker_failure_event_write_failed', {
        runId: args.runId,
        shipmentId: args.claim.id,
        orderId: args.claim.order_id,
        provider: args.claim.provider,
        code: 'SHIPPING_EVENT_WRITE_FAILED',
        eventName: failureEventName,
      });
    }

    if (terminalNeedsAttention) {
      try {
        recordShippingMetric({
          name: 'needs_attention',
          source: 'shipments_worker',
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          code: classified.code,
        });
      } catch {
        logWarn('shipping_shipments_worker_terminal_metric_write_failed', {
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          errorCode: classified.code,
          code: 'SHIPPING_METRIC_WRITE_FAILED',
        });
      }
    } else {
      try {
        recordShippingMetric({
          name: 'failed',
          source: 'shipments_worker',
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          code: classified.code,
        });
      } catch {
        logWarn('shipping_shipments_worker_terminal_metric_write_failed', {
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          errorCode: classified.code,
          code: 'SHIPPING_METRIC_WRITE_FAILED',
        });
      }

      try {
        recordShippingMetric({
          name: 'retries',
          source: 'shipments_worker',
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          code: classified.code,
        });
      } catch {
        logWarn('shipping_shipments_worker_terminal_metric_write_failed', {
          runId: args.runId,
          orderId: args.claim.order_id,
          shipmentId: args.claim.id,
          errorCode: classified.code,
          code: 'SHIPPING_METRIC_WRITE_FAILED',
        });
      }
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
