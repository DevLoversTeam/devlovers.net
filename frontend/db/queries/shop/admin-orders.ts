import 'server-only';

import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  adminAuditLog,
  orderItems,
  orders,
  orderShipping,
  shippingShipments,
  users,
} from '@/db/schema';
import {
  type CanonicalFulfillmentStage,
  deriveCanonicalFulfillmentStage,
  latestReturnStatusSql,
} from '@/lib/services/shop/fulfillment-stage';
import type { CurrencyCode } from '@/lib/shop/currency';
import { toDbMoney } from '@/lib/shop/money';
import type { PaymentProvider, PaymentStatus } from '@/lib/shop/payments';

export type AdminOrderListItem = {
  id: string;
  userId: string | null;
  totalAmountMinor: number;
  totalAmount: string;
  currency: CurrencyCode;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
  paymentIntentId: string | null;
  createdAt: Date;
  itemCount: number;
};

export type AdminOrderDetail = {
  id: string;
  userId: string | null;
  customerAccountName: string | null;
  customerAccountEmail: string | null;
  status: string;
  inventoryStatus: string;
  pspStatusReason: string | null;
  totalAmountMinor: number;
  totalAmount: string;
  currency: CurrencyCode;
  paymentStatus: PaymentStatus;
  paymentProvider: PaymentProvider;
  paymentIntentId: string | null;
  fulfillmentStage: CanonicalFulfillmentStage;
  stockRestored: boolean;
  restockedAt: Date | null;
  idempotencyKey: string;
  pspMetadata: Record<string, unknown>;
  shippingRequired: boolean | null;
  shippingProvider: string | null;
  shippingMethodCode: string | null;
  shippingStatus: string | null;
  trackingNumber: string | null;
  shippingProviderRef: string | null;
  shipmentStatus: string | null;
  shipmentAttemptCount: number | null;
  shipmentLastErrorCode: string | null;
  shipmentLastErrorMessage: string | null;
  shippingAddress: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    unitPriceMinor: number;
    lineTotalMinor: number;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export type AdminOrderHistoryEntry = {
  id: string;
  source: 'audit' | 'legacy';
  action: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  requestId: string | null;
  fromShippingStatus: string | null;
  toShippingStatus: string | null;
  fromShipmentStatus: string | null;
};

type ShipmentProjection = {
  shipmentId: string | null;
  shipmentStatus: string | null;
  shipmentAttemptCount: number | null;
  shipmentLastErrorCode: string | null;
  shipmentLastErrorMessage: string | null;
  shipmentCreatedAt: Date | null;
  shipmentUpdatedAt: Date | null;
  shippingAddress: Record<string, unknown> | null;
};

export async function getAdminOrdersPage(options: {
  limit: number;
  offset: number;
  status?: PaymentStatus;
  createdAtGte?: Date;
  createdAtLt?: Date;
}) {
  const limit = Math.max(1, Math.min(100, options.limit));
  const offset = Math.max(0, options.offset);
  const filtersRaw = [
    options.status ? eq(orders.paymentStatus, options.status) : undefined,
    options.createdAtGte
      ? gte(orders.createdAt, options.createdAtGte)
      : undefined,
    options.createdAtLt ? lt(orders.createdAt, options.createdAtLt) : undefined,
  ];
  const filters = filtersRaw.filter(
    (value): value is NonNullable<(typeof filtersRaw)[number]> =>
      value !== undefined
  );
  const whereClause = filters.length > 0 ? and(...filters) : sql`true`;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(orders)
    .where(whereClause);
  const totalCount =
    typeof total === 'bigint' ? Number(total) : Number(total ?? 0);

  const rows = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      totalAmount: orders.totalAmount,
      totalAmountMinor: orders.totalAmountMinor,
      currency: orders.currency,
      paymentStatus: orders.paymentStatus,
      paymentProvider: orders.paymentProvider,
      paymentIntentId: orders.paymentIntentId,
      createdAt: orders.createdAt,
      itemCount: sql<number>`count(${orderItems.id})`.mapWith(Number),
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(whereClause)
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map(r => ({
      ...r,
      totalAmount: toDbMoney(r.totalAmountMinor),
    })) as AdminOrderListItem[],
    total: totalCount,
  };
}

function toAdminOrderItem(
  item: {
    id: string | null;
    productId: string | null;
    productTitle: string | null;
    productSlug: string | null;
    productSku: string | null;
    quantity: number | null;
    unitPriceMinor: number | null;
    lineTotalMinor: number | null;
  } | null
): AdminOrderDetail['items'][number] | null {
  if (!item || !item.id) return null;

  if (
    !item.productId ||
    item.quantity === null ||
    item.unitPriceMinor === null ||
    item.lineTotalMinor === null
  ) {
    throw new Error('Corrupt order item row: required columns are null');
  }

  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.productTitle,
    productSlug: item.productSlug,
    productSku: item.productSku,
    quantity: item.quantity,
    unitPriceMinor: item.unitPriceMinor,
    lineTotalMinor: item.lineTotalMinor,
    unitPrice: toDbMoney(item.unitPriceMinor),
    lineTotal: toDbMoney(item.lineTotalMinor),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHistoryAction(args: {
  action: string;
  payload: Record<string, unknown>;
}): string {
  if (args.action.startsWith('shipping_admin_action.')) {
    return args.action.slice('shipping_admin_action.'.length);
  }

  if (args.action.startsWith('order_admin_action.')) {
    return args.action.slice('order_admin_action.'.length);
  }

  return readString(args.payload.action) ?? args.action;
}

function toHistoryDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLegacyShippingAdminAudit(
  pspMetadata: Record<string, unknown> | null
): AdminOrderHistoryEntry[] {
  if (!isRecord(pspMetadata)) return [];

  const rawEntries = pspMetadata.shippingAdminAudit;
  if (!Array.isArray(rawEntries)) return [];

  const entries: Array<{
    entry: AdminOrderHistoryEntry;
    index: number;
  }> = [];

  rawEntries.forEach((entry, index) => {
    if (!isRecord(entry)) return;

    const action = readString(entry.action);
    const occurredAt = toHistoryDate(entry.at);
    if (!action || !occurredAt) return;

    entries.push({
      entry: {
        id: `legacy-shipping-${index}`,
        source: 'legacy',
        action,
        occurredAt,
        actorUserId: readString(entry.actorUserId),
        actorName: null,
        actorEmail: null,
        requestId: readString(entry.requestId),
        fromShippingStatus: readString(entry.fromShippingStatus),
        toShippingStatus: readString(entry.toShippingStatus),
        fromShipmentStatus: readString(entry.fromShipmentStatus),
      },
      index,
    });
  });

  entries.sort((a, b) => {
    const diff = b.entry.occurredAt.getTime() - a.entry.occurredAt.getTime();
    return diff !== 0 ? diff : b.index - a.index;
  });

  return entries.map(item => item.entry);
}

function toCanonicalHistoryEntry(row: {
  id: string;
  action: string;
  occurredAt: Date;
  actorUserId: string | null;
  requestId: string | null;
  payload: unknown;
  actorName: string | null;
  actorEmail: string | null;
}): AdminOrderHistoryEntry {
  const payload = isRecord(row.payload) ? row.payload : {};

  return {
    id: row.id,
    source: 'audit',
    action: normalizeHistoryAction({
      action: row.action,
      payload,
    }),
    occurredAt: row.occurredAt,
    actorUserId: row.actorUserId,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    requestId: row.requestId,
    fromShippingStatus: readString(payload.fromShippingStatus),
    toShippingStatus: readString(payload.toShippingStatus),
    fromShipmentStatus: readString(payload.fromShipmentStatus),
  };
}

function buildHistoryDedupKey(entry: AdminOrderHistoryEntry): string {
  const base = [
    entry.action,
    entry.fromShippingStatus ?? '',
    entry.toShippingStatus ?? '',
    entry.fromShipmentStatus ?? '',
  ].join('|');

  if (entry.requestId) {
    return `request|${entry.requestId}|${base}`;
  }

  return `time|${entry.occurredAt.toISOString()}|${base}`;
}

function compareHistoryEntries(
  left: AdminOrderHistoryEntry,
  right: AdminOrderHistoryEntry
): number {
  const occurredAtDiff = right.occurredAt.getTime() - left.occurredAt.getTime();
  if (occurredAtDiff !== 0) return occurredAtDiff;

  if (left.source !== right.source) {
    return left.source === 'audit' ? -1 : 1;
  }

  const requestIdDiff = (right.requestId ?? '').localeCompare(
    left.requestId ?? ''
  );
  if (requestIdDiff !== 0) return requestIdDiff;

  return right.id.localeCompare(left.id);
}

function mergeHistoryEntries(args: {
  audit: AdminOrderHistoryEntry[];
  legacy: AdminOrderHistoryEntry[];
}): AdminOrderHistoryEntry[] {
  const deduped = new Map<string, AdminOrderHistoryEntry>();

  for (const entry of args.audit) {
    deduped.set(buildHistoryDedupKey(entry), entry);
  }

  for (const entry of args.legacy) {
    const key = buildHistoryDedupKey(entry);
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  return [...deduped.values()].sort(compareHistoryEntries);
}

function hasShipmentProjection(row: ShipmentProjection): boolean {
  return (
    row.shipmentId !== null ||
    row.shipmentStatus !== null ||
    row.shipmentAttemptCount !== null ||
    row.shipmentLastErrorCode !== null ||
    row.shipmentLastErrorMessage !== null ||
    row.shipmentCreatedAt !== null ||
    row.shipmentUpdatedAt !== null
  );
}

function compareShipmentProjection(
  left: ShipmentProjection,
  right: ShipmentProjection
): number {
  const createdAtDiff =
    (right.shipmentCreatedAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
    (left.shipmentCreatedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
  if (createdAtDiff !== 0) return createdAtDiff;

  const updatedAtDiff =
    (right.shipmentUpdatedAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
    (left.shipmentUpdatedAt?.getTime() ?? Number.NEGATIVE_INFINITY);
  if (updatedAtDiff !== 0) return updatedAtDiff;

  return (right.shipmentId ?? '').localeCompare(left.shipmentId ?? '');
}

function selectLatestShipmentProjection(
  rows: Array<{ shipping: ShipmentProjection }>
): ShipmentProjection | null {
  const candidates = rows
    .map(row => row.shipping)
    .filter(hasShipmentProjection)
    .sort(compareShipmentProjection);

  return candidates[0] ?? null;
}

export async function getAdminOrderTimeline(
  orderId: string
): Promise<AdminOrderHistoryEntry[]> {
  const auditRows = await db
    .select({
      id: adminAuditLog.id,
      action: adminAuditLog.action,
      occurredAt: adminAuditLog.occurredAt,
      actorUserId: adminAuditLog.actorUserId,
      requestId: adminAuditLog.requestId,
      payload: adminAuditLog.payload,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(users.id, adminAuditLog.actorUserId))
    .where(eq(adminAuditLog.orderId, orderId))
    .orderBy(
      desc(adminAuditLog.occurredAt),
      desc(adminAuditLog.createdAt),
      desc(adminAuditLog.id)
    );

  const [legacyOrder] = await db
    .select({ pspMetadata: orders.pspMetadata })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  return mergeHistoryEntries({
    audit: auditRows.map(toCanonicalHistoryEntry),
    legacy: parseLegacyShippingAdminAudit(
      isRecord(legacyOrder?.pspMetadata) ? legacyOrder.pspMetadata : null
    ),
  });
}

export async function getAdminOrderDetail(
  orderId: string
): Promise<AdminOrderDetail | null> {
  const rows = await db
    .select({
      order: {
        id: orders.id,
        userId: orders.userId,
        customerAccountName: users.name,
        customerAccountEmail: users.email,
        status: orders.status,
        inventoryStatus: orders.inventoryStatus,
        pspStatusReason: orders.pspStatusReason,
        totalAmount: orders.totalAmount,
        totalAmountMinor: orders.totalAmountMinor,
        currency: orders.currency,
        paymentStatus: orders.paymentStatus,
        paymentProvider: orders.paymentProvider,
        paymentIntentId: orders.paymentIntentId,
        orderStatus: orders.status,
        returnStatus: latestReturnStatusSql(orders.id),
        stockRestored: orders.stockRestored,
        restockedAt: orders.restockedAt,
        idempotencyKey: orders.idempotencyKey,
        pspMetadata: orders.pspMetadata,
        shippingRequired: orders.shippingRequired,
        shippingProvider: orders.shippingProvider,
        shippingMethodCode: orders.shippingMethodCode,
        shippingStatus: orders.shippingStatus,
        trackingNumber: orders.trackingNumber,
        shippingProviderRef: orders.shippingProviderRef,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      },
      shipping: {
        shipmentId: shippingShipments.id,
        shipmentStatus: shippingShipments.status,
        shipmentAttemptCount: shippingShipments.attemptCount,
        shipmentLastErrorCode: shippingShipments.lastErrorCode,
        shipmentLastErrorMessage: shippingShipments.lastErrorMessage,
        shipmentCreatedAt: shippingShipments.createdAt,
        shipmentUpdatedAt: shippingShipments.updatedAt,
        shippingAddress: orderShipping.shippingAddress,
      },
      item: {
        id: orderItems.id,
        productId: orderItems.productId,
        productTitle: orderItems.productTitle,
        productSlug: orderItems.productSlug,
        productSku: orderItems.productSku,
        quantity: orderItems.quantity,
        unitPriceMinor: orderItems.unitPriceMinor,
        lineTotalMinor: orderItems.lineTotalMinor,
      },
    })
    .from(orders)
    .leftJoin(shippingShipments, eq(shippingShipments.orderId, orders.id))
    .leftJoin(orderShipping, eq(orderShipping.orderId, orders.id))
    .leftJoin(users, eq(users.id, orders.userId))
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.id, orderId));

  if (rows.length === 0) return null;

  const base = rows[0]!.order;
  const latestShipment = selectLatestShipmentProjection(rows);
  const shipmentStatus = latestShipment?.shipmentStatus ?? null;
  const fulfillmentStage = deriveCanonicalFulfillmentStage({
    orderStatus: base.orderStatus,
    shippingStatus: base.shippingStatus,
    shipmentStatus: typeof shipmentStatus === 'string' ? shipmentStatus : null,
    returnStatus:
      typeof base.returnStatus === 'string' ? base.returnStatus : null,
  });

  const itemsById = new Map<string, AdminOrderDetail['items'][number]>();
  for (const row of rows) {
    const item = toAdminOrderItem(row.item);
    if (item && !itemsById.has(item.id)) {
      itemsById.set(item.id, item);
    }
  }
  const items = [...itemsById.values()];

  return {
    id: base.id,
    userId: base.userId,
    customerAccountName: base.customerAccountName,
    customerAccountEmail: base.customerAccountEmail,
    status: base.status,
    inventoryStatus: base.inventoryStatus,
    pspStatusReason: base.pspStatusReason,
    totalAmountMinor: base.totalAmountMinor,
    fulfillmentStage,
    currency: base.currency,
    paymentStatus: base.paymentStatus,
    paymentProvider: base.paymentProvider,
    paymentIntentId: base.paymentIntentId,
    stockRestored: base.stockRestored,
    restockedAt: base.restockedAt,
    idempotencyKey: base.idempotencyKey,
    pspMetadata: (base.pspMetadata ?? {}) as Record<string, unknown>,
    shippingRequired: base.shippingRequired,
    shippingProvider: base.shippingProvider,
    shippingMethodCode: base.shippingMethodCode,
    shippingStatus: base.shippingStatus,
    trackingNumber: base.trackingNumber,
    shippingProviderRef: base.shippingProviderRef,
    shipmentStatus,
    shipmentAttemptCount: latestShipment?.shipmentAttemptCount ?? null,
    shipmentLastErrorCode: latestShipment?.shipmentLastErrorCode ?? null,
    shipmentLastErrorMessage: latestShipment?.shipmentLastErrorMessage ?? null,
    shippingAddress:
      latestShipment?.shippingAddress ??
      (rows[0]?.shipping.shippingAddress as Record<string, unknown> | null) ??
      null,
    totalAmount: toDbMoney(base.totalAmountMinor),
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    items,
  };
}
