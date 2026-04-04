import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { npCities, npWarehouses, orders, orderShipping } from '@/db/schema';
import { writeAdminAudit } from '@/lib/services/shop/events/write-admin-audit';
import { evaluateOrderShippingEligibility } from '@/lib/services/shop/shipping/eligibility';
import type { AdminOrderShippingEditInput } from '@/lib/validation/shop-admin-shipping';

type EditableShippingStateRow = {
  order_id: string;
  payment_status: string | null;
  order_status: string | null;
  inventory_status: string | null;
  psp_status_reason: string | null;
  shipping_required: boolean | null;
  shipping_provider: string | null;
  shipping_method_code: string | null;
  shipping_status: string | null;
  shipping_address: unknown;
  shipment_id: string | null;
  shipment_status: string | null;
};

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ShippingEditComparable = {
  provider: 'nova_poshta';
  methodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
  selection: {
    cityRef: string | null;
    warehouseRef: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
  };
  recipient: {
    fullName: string | null;
    phone: string | null;
    email: string | null;
    comment: string | null;
  };
};

export class AdminOrderShippingEditError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminOrderShippingEditError';
    this.code = code;
    this.status = status;
  }
}

function invalid(code: string, message: string, status = 409) {
  return new AdminOrderShippingEditError(code, message, status);
}

function readRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const maybe = value as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  return [];
}

function first<T>(value: unknown): T | null {
  return readRows<T>(value)[0] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readQuoteSnapshot(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw) || !isRecord(raw.quote)) return undefined;
  return raw.quote;
}

function toComparableSnapshot(
  raw: unknown,
  fallbackMethodCode: string | null
): ShippingEditComparable | null {
  const root = isRecord(raw) ? raw : {};
  const selection = isRecord(root.selection) ? root.selection : {};
  const recipient = isRecord(root.recipient) ? root.recipient : {};
  const methodCode = readString(root.methodCode) ?? fallbackMethodCode;

  if (
    methodCode !== 'NP_WAREHOUSE' &&
    methodCode !== 'NP_LOCKER' &&
    methodCode !== 'NP_COURIER'
  ) {
    return null;
  }

  return {
    provider: 'nova_poshta',
    methodCode,
    selection: {
      cityRef: readString(selection.cityRef),
      warehouseRef: readString(selection.warehouseRef),
      addressLine1: readString(selection.addressLine1),
      addressLine2: readString(selection.addressLine2),
    },
    recipient: {
      fullName: readString(recipient.fullName),
      phone: readString(recipient.phone),
      email: readString(recipient.email),
      comment: readString(recipient.comment),
    },
  };
}

function buildNextComparable(
  input: AdminOrderShippingEditInput
): ShippingEditComparable {
  return {
    provider: 'nova_poshta',
    methodCode: input.methodCode,
    selection: {
      cityRef: input.selection.cityRef,
      warehouseRef: input.selection.warehouseRef ?? null,
      addressLine1: input.selection.addressLine1 ?? null,
      addressLine2: input.selection.addressLine2 ?? null,
    },
    recipient: {
      fullName: input.recipient.fullName,
      phone: input.recipient.phone,
      email: input.recipient.email ?? null,
      comment: input.recipient.comment ?? null,
    },
  };
}

function snapshotsEqual(
  left: ShippingEditComparable | null,
  right: ShippingEditComparable
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasQuoteAffectingChange(
  current: ShippingEditComparable | null,
  next: ShippingEditComparable
): boolean {
  if (!current) return true;

  return (
    current.methodCode !== next.methodCode ||
    current.selection.cityRef !== next.selection.cityRef ||
    current.selection.warehouseRef !== next.selection.warehouseRef ||
    current.selection.addressLine1 !== next.selection.addressLine1 ||
    current.selection.addressLine2 !== next.selection.addressLine2
  );
}

export function getAdminOrderShippingEditAvailability(args: {
  shippingReady: boolean;
  shippingStatus: string | null;
  shipmentStatus: string | null;
}): boolean {
  // The persisted shipping_shipment_status enum does not include legacy/UI-only
  // aliases such as "created", so eligibility is intentionally limited to the
  // actual shipment states that can still be edited safely.
  if (!args.shippingReady) return false;

  if (
    args.shippingStatus !== 'pending' &&
    args.shippingStatus !== 'queued' &&
    args.shippingStatus !== 'needs_attention'
  ) {
    return false;
  }

  return (
    args.shipmentStatus === null ||
    args.shipmentStatus === 'queued' ||
    args.shipmentStatus === 'failed' ||
    args.shipmentStatus === 'needs_attention'
  );
}

async function loadEditableState(
  executor: Pick<DbTx, 'execute'>,
  orderId: string
): Promise<EditableShippingStateRow | null> {
  const result = await executor.execute<EditableShippingStateRow>(sql`
    select
      o.id as order_id,
      o.payment_status,
      o.status as order_status,
      o.inventory_status,
      o.psp_status_reason,
      o.shipping_required,
      o.shipping_provider,
      o.shipping_method_code,
      o.shipping_status,
      os.shipping_address,
      s.id as shipment_id,
      s.status as shipment_status
    from orders o
    left join order_shipping os on os.order_id = o.id
    left join shipping_shipments s on s.order_id = o.id
    where o.id = ${orderId}::uuid
    order by s.created_at desc nulls last
    limit 1
    for update of o
  `);

  const state = first<EditableShippingStateRow>(result);
  if (!state?.shipment_id) {
    return state;
  }

  const shipmentResult = await executor.execute<{
    status: string | null;
  }>(sql`
    select status
    from shipping_shipments
    where id = ${state.shipment_id}::uuid
    for update
  `);
  const lockedShipment = first<{ status: string | null }>(shipmentResult);

  return {
    ...state,
    shipment_status: lockedShipment?.status ?? state.shipment_status,
  };
}

function assertEditableState(
  state: EditableShippingStateRow | null
): asserts state is EditableShippingStateRow {
  if (!state) {
    throw new AdminOrderShippingEditError(
      'ORDER_NOT_FOUND',
      'Order not found.',
      404
    );
  }

  if (state.shipping_required !== true) {
    throw invalid('SHIPPING_NOT_REQUIRED', 'Order does not require shipping.');
  }

  if (state.shipping_provider !== 'nova_poshta') {
    throw invalid(
      'SHIPPING_PROVIDER_UNSUPPORTED',
      'Only Nova Poshta shipping can be edited.'
    );
  }

  const shippingReady = evaluateOrderShippingEligibility({
    paymentStatus: state.payment_status,
    orderStatus: state.order_status,
    inventoryStatus: state.inventory_status,
    pspStatusReason: state.psp_status_reason,
  }).ok;

  if (
    !getAdminOrderShippingEditAvailability({
      shippingReady,
      shippingStatus: state.shipping_status,
      shipmentStatus: state.shipment_status,
    })
  ) {
    throw invalid(
      'SHIPPING_EDIT_NOT_ALLOWED',
      'Shipping details cannot be edited in the current fulfillment state.'
    );
  }
}

async function resolveSnapshotData(args: {
  executor: Pick<DbTx, 'select'>;
  input: AdminOrderShippingEditInput;
  existingSnapshot: unknown;
  preserveQuote: boolean;
}) {
  const [city] = await args.executor
    .select({
      ref: npCities.ref,
      nameUa: npCities.nameUa,
      nameRu: npCities.nameRu,
      area: npCities.area,
      region: npCities.region,
    })
    .from(npCities)
    .where(
      and(
        eq(npCities.ref, args.input.selection.cityRef),
        eq(npCities.isActive, true)
      )
    )
    .limit(1);

  if (!city) {
    throw invalid(
      'INVALID_SHIPPING_ADDRESS',
      'Selected city reference is invalid.',
      400
    );
  }

  let warehouse:
    | {
        ref: string;
        name: string;
        address: string | null;
        isPostMachine: boolean;
      }
    | undefined;

  if (
    args.input.methodCode === 'NP_WAREHOUSE' ||
    args.input.methodCode === 'NP_LOCKER'
  ) {
    const warehouseRef = args.input.selection.warehouseRef ?? null;
    if (!warehouseRef) {
      throw invalid(
        'INVALID_SHIPPING_ADDRESS',
        'Pickup point reference is required for the selected delivery method.',
        400
      );
    }

    [warehouse] = await args.executor
      .select({
        ref: npWarehouses.ref,
        name: npWarehouses.name,
        address: npWarehouses.address,
        isPostMachine: npWarehouses.isPostMachine,
      })
      .from(npWarehouses)
      .where(
        and(
          eq(npWarehouses.ref, warehouseRef),
          eq(npWarehouses.cityRef, city.ref),
          eq(npWarehouses.isActive, true)
        )
      )
      .limit(1);

    if (!warehouse) {
      throw invalid(
        'INVALID_SHIPPING_ADDRESS',
        'Selected pickup point does not belong to the selected city.',
        400
      );
    }

    if (args.input.methodCode === 'NP_LOCKER' && !warehouse.isPostMachine) {
      throw invalid(
        'INVALID_SHIPPING_ADDRESS',
        'Selected pickup point is not a parcel locker.',
        400
      );
    }
  }

  const quote = args.preserveQuote
    ? readQuoteSnapshot(args.existingSnapshot)
    : undefined;

  const snapshot: Record<string, unknown> = {
    provider: 'nova_poshta',
    methodCode: args.input.methodCode,
    ...(quote ? { quote } : {}),
    selection: {
      cityRef: city.ref,
      cityNameUa: city.nameUa,
      cityNameRu: city.nameRu ?? null,
      area: city.area ?? null,
      region: city.region ?? null,
      warehouseRef: warehouse?.ref ?? null,
      warehouseName: warehouse?.name ?? null,
      warehouseAddress: warehouse?.address ?? null,
      addressLine1: args.input.selection.addressLine1 ?? null,
      addressLine2: args.input.selection.addressLine2 ?? null,
    },
    recipient: {
      fullName: args.input.recipient.fullName,
      phone: args.input.recipient.phone,
      email: args.input.recipient.email ?? null,
      comment: args.input.recipient.comment ?? null,
    },
  };

  return {
    snapshot,
    methodCode: args.input.methodCode,
  };
}

export type AdminOrderShippingEditResult = {
  orderId: string;
  shippingMethodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
  changed: boolean;
};

export async function applyAdminOrderShippingEdit(args: {
  orderId: string;
  shipping: AdminOrderShippingEditInput;
  actorUserId: string | null;
  requestId: string;
}): Promise<AdminOrderShippingEditResult> {
  return db.transaction(async tx => {
    const state = await loadEditableState(tx, args.orderId);
    assertEditableState(state);

    const currentComparable = toComparableSnapshot(
      state.shipping_address,
      state.shipping_method_code
    );
    const nextComparable = buildNextComparable(args.shipping);
    const quoteAffectingChange = hasQuoteAffectingChange(
      currentComparable,
      nextComparable
    );

    if (snapshotsEqual(currentComparable, nextComparable)) {
      return {
        orderId: state.order_id,
        shippingMethodCode: args.shipping.methodCode,
        changed: false,
      };
    }

    const resolved = await resolveSnapshotData({
      executor: tx,
      input: args.shipping,
      existingSnapshot: state.shipping_address,
      preserveQuote: true,
    });

    if (quoteAffectingChange) {
      throw invalid(
        'SHIPPING_EDIT_REQUIRES_TOTAL_SYNC',
        'Quote-affecting shipping edits are blocked until order totals can be safely synchronized.'
      );
    }

    const now = new Date();
    const [updatedOrder] = await tx
      .update(orders)
      .set({
        shippingProvider: 'nova_poshta',
        shippingMethodCode: resolved.methodCode,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.id, args.orderId),
          eq(orders.shippingRequired, true),
          eq(orders.shippingProvider, 'nova_poshta'),
          sql`${orders.shippingStatus} is not distinct from ${state.shipping_status}`
        )
      )
      .returning({ id: orders.id });

    if (!updatedOrder) {
      throw invalid(
        'SHIPPING_EDIT_NOT_ALLOWED',
        'Shipping details cannot be edited in the current fulfillment state.'
      );
    }

    await tx
      .insert(orderShipping)
      .values({
        orderId: args.orderId,
        shippingAddress: resolved.snapshot,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: orderShipping.orderId,
        set: {
          shippingAddress: resolved.snapshot,
          updatedAt: now,
        },
      });

    const fromMethodCode =
      currentComparable?.methodCode ?? state.shipping_method_code ?? null;
    const fromCityRef = currentComparable?.selection.cityRef ?? null;
    const toCityRef = nextComparable.selection.cityRef;
    const fromWarehouseRef = currentComparable?.selection.warehouseRef ?? null;
    const toWarehouseRef = nextComparable.selection.warehouseRef;
    const addressChanged =
      (currentComparable?.selection.addressLine1 ?? null) !==
        nextComparable.selection.addressLine1 ||
      (currentComparable?.selection.addressLine2 ?? null) !==
        nextComparable.selection.addressLine2;
    const recipientChanged = {
      fullName:
        (currentComparable?.recipient.fullName ?? null) !==
        nextComparable.recipient.fullName,
      phone:
        (currentComparable?.recipient.phone ?? null) !==
        nextComparable.recipient.phone,
      email:
        (currentComparable?.recipient.email ?? null) !==
        nextComparable.recipient.email,
      comment:
        (currentComparable?.recipient.comment ?? null) !==
        nextComparable.recipient.comment,
    };

    await writeAdminAudit(
      {
        orderId: args.orderId,
        actorUserId: args.actorUserId,
        action: 'order_admin_action.edit_shipping',
        targetType: 'order',
        targetId: args.orderId,
        requestId: args.requestId,
        payload: {
          action: 'edit_shipping',
          shippingProvider: 'nova_poshta',
          fromMethodCode,
          toMethodCode: nextComparable.methodCode,
          fromCityRef,
          toCityRef,
          fromWarehouseRef,
          toWarehouseRef,
          addressChanged,
          recipientChanged,
        },
        dedupeSeed: {
          domain: 'order_admin_action',
          action: 'edit_shipping',
          orderId: args.orderId,
          requestId: args.requestId,
          fromMethodCode,
          toMethodCode: nextComparable.methodCode,
          fromCityRef,
          toCityRef,
          fromWarehouseRef,
          toWarehouseRef,
        },
        occurredAt: now,
      },
      { db: tx }
    );

    return {
      orderId: args.orderId,
      shippingMethodCode: resolved.methodCode,
      changed: true,
    };
  });
}
