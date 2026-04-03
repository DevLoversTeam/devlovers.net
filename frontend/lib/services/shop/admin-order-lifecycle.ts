import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders, shippingShipments } from '@/db/schema';
import { logError, logWarn } from '@/lib/logging';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
  PspUnavailableError,
} from '@/lib/services/errors';
import { cancelMonobankUnpaidPayment } from '@/lib/services/orders/monobank-cancel-payment';
import { restockOrder } from '@/lib/services/orders/restock';
import { buildAdminAuditDedupeKey } from '@/lib/services/shop/events/dedupe-key';
import { writeAdminAudit } from '@/lib/services/shop/events/write-admin-audit';
import {
  evaluateOrderShippingEligibility,
  type OrderShippingEligibilityResult,
} from '@/lib/services/shop/shipping/eligibility';
import { ensureQueuedInitialShipment } from '@/lib/services/shop/shipping/ensure-queued-initial-shipment';

export type AdminOrderLifecycleAction = 'confirm' | 'cancel' | 'complete';

type LifecycleStateRow = {
  id: string;
  paymentProvider: string;
  paymentStatus: string;
  status: string;
  inventoryStatus: string;
  shippingRequired: boolean | null;
  shippingProvider: string | null;
  shippingMethodCode: string | null;
  shippingStatus: string | null;
  pspStatusReason: string | null;
  trackingNumber: string | null;
  stockRestored: boolean;
  restockedAt: Date | null;
  shipmentStatus: string | null;
};

export type AdminOrderLifecycleVisibilityState = Pick<
  LifecycleStateRow,
  | 'status'
  | 'paymentStatus'
  | 'inventoryStatus'
  | 'shippingRequired'
  | 'shippingProvider'
  | 'shippingMethodCode'
  | 'shippingStatus'
  | 'pspStatusReason'
  | 'stockRestored'
  | 'shipmentStatus'
>;

export type ApplyAdminOrderLifecycleActionResult = {
  action: AdminOrderLifecycleAction;
  orderId: string;
  changed: boolean;
  status: string;
  paymentStatus: string;
  shippingStatus: string | null;
};

export class AdminOrderLifecycleActionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AdminOrderLifecycleActionError';
    this.code = code;
    this.status = status;
  }
}

function invalid(code: string, message: string, status = 409) {
  return new AdminOrderLifecycleActionError(code, message, status);
}

async function loadLifecycleState(
  orderId: string
): Promise<LifecycleStateRow | null> {
  const [row] = await db
    .select({
      id: orders.id,
      paymentProvider: orders.paymentProvider,
      paymentStatus: orders.paymentStatus,
      status: orders.status,
      inventoryStatus: orders.inventoryStatus,
      shippingRequired: orders.shippingRequired,
      shippingProvider: orders.shippingProvider,
      shippingMethodCode: orders.shippingMethodCode,
      shippingStatus: orders.shippingStatus,
      pspStatusReason: orders.pspStatusReason,
      trackingNumber: orders.trackingNumber,
      stockRestored: orders.stockRestored,
      restockedAt: orders.restockedAt,
      shipmentStatus: shippingShipments.status,
    })
    .from(orders)
    .leftJoin(shippingShipments, eq(shippingShipments.orderId, orders.id))
    .where(eq(orders.id, orderId))
    .orderBy(desc(shippingShipments.createdAt))
    .limit(1);

  return row ?? null;
}

function isFinalCanceled(state: LifecycleStateRow): boolean {
  return (
    state.status === 'CANCELED' &&
    state.inventoryStatus === 'released' &&
    state.stockRestored === true
  );
}

function isPaidLike(state: LifecycleStateRow): boolean {
  return (
    state.paymentStatus === 'paid' ||
    state.paymentStatus === 'refunded' ||
    state.status === 'PAID'
  );
}

export function getAdminOrderLifecycleAvailability(
  state: AdminOrderLifecycleVisibilityState
): {
  confirm: boolean;
  cancel: boolean;
  complete: boolean;
} {
  const shippingEligible = evaluateOrderShippingEligibility({
    paymentStatus: state.paymentStatus,
    orderStatus: state.status,
    inventoryStatus: state.inventoryStatus,
    pspStatusReason: state.pspStatusReason,
  }).ok;

  return {
    confirm:
      state.status === 'INVENTORY_RESERVED' &&
      state.paymentStatus === 'paid' &&
      state.inventoryStatus === 'reserved',
    cancel:
      !isFinalCanceled(state as LifecycleStateRow) &&
      !isPaidLike(state as LifecycleStateRow),
    complete:
      state.shippingRequired === true &&
      state.shippingProvider === 'nova_poshta' &&
      !!state.shippingMethodCode &&
      state.shippingStatus !== 'delivered' &&
      shippingEligible &&
      state.shipmentStatus === 'succeeded' &&
      state.shippingStatus === 'shipped',
  };
}

function shippingEligibilityOrThrow(
  orderId: string,
  state: LifecycleStateRow
): OrderShippingEligibilityResult {
  const eligibility = evaluateOrderShippingEligibility({
    paymentStatus: state.paymentStatus,
    orderStatus: state.status,
    inventoryStatus: state.inventoryStatus,
    pspStatusReason: state.pspStatusReason,
  });

  if (!eligibility.ok) {
    throw new OrderStateInvalidError(eligibility.message, {
      orderId,
      details: {
        code: eligibility.code,
        paymentStatus: state.paymentStatus,
        orderStatus: state.status,
        inventoryStatus: state.inventoryStatus,
        pspStatusReason: state.pspStatusReason,
      },
    });
  }

  return eligibility;
}

function toSupportedShipmentProvider(
  paymentProvider: string
): 'stripe' | 'monobank' | undefined {
  if (paymentProvider === 'stripe' || paymentProvider === 'monobank') {
    return paymentProvider;
  }

  return undefined;
}

function shouldEnsureConfirmedOrderShipment(state: LifecycleStateRow): boolean {
  return (
    state.shippingRequired === true &&
    state.shippingProvider === 'nova_poshta' &&
    !!state.shippingMethodCode
  );
}

function canRepairConfirmedOrderSideEffects(state: LifecycleStateRow): boolean {
  if (!shouldEnsureConfirmedOrderShipment(state)) {
    return false;
  }

  return evaluateOrderShippingEligibility({
    paymentStatus: state.paymentStatus,
    orderStatus: state.status,
    inventoryStatus: state.inventoryStatus,
    pspStatusReason: state.pspStatusReason,
  }).ok;
}

function buildConfirmAuditDedupeKey(orderId: string): string {
  return buildAdminAuditDedupeKey({
    domain: 'order_admin_action',
    action: 'confirm',
    orderId,
  });
}

function buildCancelAuditDedupeKey(orderId: string): string {
  return buildAdminAuditDedupeKey({
    domain: 'order_admin_action',
    action: 'cancel',
    orderId,
  });
}

function buildCompleteAuditDedupeKey(orderId: string): string {
  return buildAdminAuditDedupeKey({
    domain: 'order_admin_action',
    action: 'complete',
    orderId,
  });
}

async function repairCancelAudit(args: {
  current: LifecycleStateRow;
  actorUserId: string | null;
  requestId: string;
  fromStatus?: string;
  fromPaymentStatus?: string;
  fromShippingStatus?: string | null;
}) {
  await writeAdminAudit({
    orderId: args.current.id,
    actorUserId: args.actorUserId,
    action: 'order_admin_action.cancel',
    targetType: 'order',
    targetId: args.current.id,
    requestId: args.requestId,
    dedupeKey: buildCancelAuditDedupeKey(args.current.id),
    payload: {
      action: 'cancel',
      fromStatus: args.fromStatus ?? args.current.status,
      toStatus: args.current.status,
      fromPaymentStatus: args.fromPaymentStatus ?? args.current.paymentStatus,
      toPaymentStatus: args.current.paymentStatus,
      fromShippingStatus:
        args.fromShippingStatus ?? args.current.shippingStatus,
      toShippingStatus: args.current.shippingStatus,
    },
  });
}

async function repairCompleteAudit(args: {
  current: LifecycleStateRow;
  actorUserId: string | null;
  requestId: string;
  fromShippingStatus?: string | null;
  fromShipmentStatus?: string | null;
}) {
  await writeAdminAudit({
    orderId: args.current.id,
    actorUserId: args.actorUserId,
    action: 'order_admin_action.complete',
    targetType: 'order',
    targetId: args.current.id,
    requestId: args.requestId,
    dedupeKey: buildCompleteAuditDedupeKey(args.current.id),
    payload: {
      action: 'complete',
      fromShippingStatus:
        args.fromShippingStatus ??
        (args.current.shippingStatus === 'delivered'
          ? 'shipped'
          : args.current.shippingStatus),
      toShippingStatus: args.current.shippingStatus,
      fromShipmentStatus:
        args.fromShipmentStatus ?? args.current.shipmentStatus,
    },
  });
}

async function writeLifecycleAuditNonBlocking(args: {
  orderId: string;
  requestId: string;
  action: AdminOrderLifecycleAction;
  write: () => Promise<unknown>;
}): Promise<void> {
  try {
    await args.write();
  } catch (error) {
    logError('admin_order_lifecycle_audit_failed', error, {
      orderId: args.orderId,
      requestId: args.requestId,
      action: args.action,
      code: 'ADMIN_AUDIT_FAILED',
    });
  }
}

function normalizeMonobankCancelError(error: unknown): never {
  if (error instanceof AdminOrderLifecycleActionError) {
    throw error;
  }

  if (error instanceof InvalidPayloadError) {
    throw new AdminOrderLifecycleActionError(error.code, error.message, 409);
  }

  if (error instanceof PspUnavailableError) {
    throw new AdminOrderLifecycleActionError(error.code, error.message, 503);
  }

  if (error instanceof OrderNotFoundError) {
    throw new AdminOrderLifecycleActionError(error.code, error.message, 404);
  }

  throw error;
}

async function repairConfirmedOrderSideEffects(args: {
  current: LifecycleStateRow;
  actorUserId: string | null;
  requestId: string;
  now: Date;
  auditFromStatus?: string;
}) {
  const shipmentSync = canRepairConfirmedOrderSideEffects(args.current)
    ? await ensureQueuedInitialShipment({
        now: args.now,
        orderId: args.current.id,
        paymentProvider: toSupportedShipmentProvider(
          args.current.paymentProvider
        ),
      })
    : {
        insertedShipment: false,
        queuedShipment: false,
        updatedOrder: false,
      };

  await writeLifecycleAuditNonBlocking({
    orderId: args.current.id,
    requestId: args.requestId,
    action: 'confirm',
    write: () =>
      writeAdminAudit({
        orderId: args.current.id,
        actorUserId: args.actorUserId,
        action: 'order_admin_action.confirm',
        targetType: 'order',
        targetId: args.current.id,
        requestId: args.requestId,
        dedupeKey: buildConfirmAuditDedupeKey(args.current.id),
        payload: {
          action: 'confirm',
          fromStatus: args.auditFromStatus ?? args.current.status,
          toStatus: 'PAID',
          paymentStatus: args.current.paymentStatus,
          insertedShipment: shipmentSync.insertedShipment,
          queuedShipment: shipmentSync.queuedShipment,
          updatedShippingStatus: shipmentSync.updatedOrder,
        },
      }),
  });

  return {
    repaired: true,
    shipmentSync,
  };
}

async function applyConfirm(args: {
  orderId: string;
  actorUserId: string | null;
  requestId: string;
}): Promise<ApplyAdminOrderLifecycleActionResult> {
  const current = await loadLifecycleState(args.orderId);
  if (!current) {
    throw new AdminOrderLifecycleActionError(
      'ORDER_NOT_FOUND',
      'Order not found.',
      404
    );
  }

  if (current.status === 'PAID') {
    const beforeShippingStatus = current.shippingStatus;
    await repairConfirmedOrderSideEffects({
      current,
      actorUserId: args.actorUserId,
      requestId: args.requestId,
      now: new Date(),
    });
    const latest = await loadLifecycleState(args.orderId);
    if (!latest) throw new OrderNotFoundError('Order not found.');

    return {
      action: 'confirm',
      orderId: latest.id,
      changed: latest.shippingStatus !== beforeShippingStatus,
      status: latest.status,
      paymentStatus: latest.paymentStatus,
      shippingStatus: latest.shippingStatus,
    };
  }

  if (current.paymentStatus !== 'paid') {
    throw invalid(
      'ORDER_CONFIRM_REQUIRES_PAID_PAYMENT',
      'Only paid orders can be confirmed.'
    );
  }

  if (current.status !== 'INVENTORY_RESERVED') {
    throw invalid(
      'ORDER_CONFIRM_NOT_ALLOWED',
      'Order cannot be confirmed in current state.'
    );
  }

  if (current.inventoryStatus !== 'reserved') {
    throw invalid(
      'ORDER_CONFIRM_INVENTORY_NOT_READY',
      'Order inventory is not committed.'
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      status: 'PAID',
      failureCode: null,
      failureMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, args.orderId),
        eq(orders.status, 'INVENTORY_RESERVED'),
        eq(orders.paymentStatus, 'paid'),
        eq(orders.inventoryStatus, 'reserved')
      )
    )
    .returning({ id: orders.id });

  if (!updated) {
    const latest = await loadLifecycleState(args.orderId);
    if (latest?.status === 'PAID') {
      const beforeShippingStatus = latest.shippingStatus;
      await repairConfirmedOrderSideEffects({
        current: latest,
        actorUserId: args.actorUserId,
        requestId: args.requestId,
        now,
      });
      const repaired = await loadLifecycleState(args.orderId);
      if (!repaired) throw new OrderNotFoundError('Order not found.');

      return {
        action: 'confirm',
        orderId: repaired.id,
        changed: repaired.shippingStatus !== beforeShippingStatus,
        status: repaired.status,
        paymentStatus: repaired.paymentStatus,
        shippingStatus: repaired.shippingStatus,
      };
    }

    throw invalid(
      'ORDER_CONFIRM_NOT_ALLOWED',
      'Order cannot be confirmed in current state.'
    );
  }

  await repairConfirmedOrderSideEffects({
    current: {
      ...current,
      status: 'PAID',
    },
    actorUserId: args.actorUserId,
    requestId: args.requestId,
    now,
    auditFromStatus: current.status,
  });

  const latest = await loadLifecycleState(args.orderId);
  if (!latest) throw new OrderNotFoundError('Order not found.');

  return {
    action: 'confirm',
    orderId: latest.id,
    changed: true,
    status: latest.status,
    paymentStatus: latest.paymentStatus,
    shippingStatus: latest.shippingStatus,
  };
}

async function applyCancel(args: {
  orderId: string;
  actorUserId: string | null;
  requestId: string;
}): Promise<ApplyAdminOrderLifecycleActionResult> {
  const current = await loadLifecycleState(args.orderId);
  if (!current) {
    throw new AdminOrderLifecycleActionError(
      'ORDER_NOT_FOUND',
      'Order not found.',
      404
    );
  }

  if (isFinalCanceled(current)) {
    await writeLifecycleAuditNonBlocking({
      orderId: current.id,
      requestId: args.requestId,
      action: 'cancel',
      write: () =>
        repairCancelAudit({
          current,
          actorUserId: args.actorUserId,
          requestId: args.requestId,
        }),
    });

    return {
      action: 'cancel',
      orderId: current.id,
      changed: false,
      status: current.status,
      paymentStatus: current.paymentStatus,
      shippingStatus: current.shippingStatus,
    };
  }

  if (isPaidLike(current)) {
    throw invalid(
      'ORDER_CANCEL_REQUIRES_REFUND',
      'Paid orders must use refund flow instead of cancel.'
    );
  }

  if (
    current.paymentProvider === 'monobank' &&
    (current.paymentStatus === 'pending' ||
      current.paymentStatus === 'requires_payment')
  ) {
    try {
      await cancelMonobankUnpaidPayment({
        orderId: args.orderId,
        requestId: args.requestId,
      });
    } catch (error) {
      normalizeMonobankCancelError(error);
    }
  } else {
    await restockOrder(args.orderId, {
      reason: 'canceled',
      workerId: 'admin-order-lifecycle',
    });
  }

  const latest = await loadLifecycleState(args.orderId);
  if (!latest) throw new OrderNotFoundError('Order not found.');

  const changed =
    latest.status !== current.status ||
    latest.paymentStatus !== current.paymentStatus ||
    latest.shippingStatus !== current.shippingStatus ||
    latest.stockRestored !== current.stockRestored ||
    latest.inventoryStatus !== current.inventoryStatus;

  if (changed) {
    await writeLifecycleAuditNonBlocking({
      orderId: latest.id,
      requestId: args.requestId,
      action: 'cancel',
      write: () =>
        repairCancelAudit({
          current: latest,
          actorUserId: args.actorUserId,
          requestId: args.requestId,
          fromStatus: current.status,
          fromPaymentStatus: current.paymentStatus,
          fromShippingStatus: current.shippingStatus,
        }),
    });
  }

  return {
    action: 'cancel',
    orderId: latest.id,
    changed,
    status: latest.status,
    paymentStatus: latest.paymentStatus,
    shippingStatus: latest.shippingStatus,
  };
}

async function applyComplete(args: {
  orderId: string;
  actorUserId: string | null;
  requestId: string;
}): Promise<ApplyAdminOrderLifecycleActionResult> {
  const current = await loadLifecycleState(args.orderId);
  if (!current) {
    throw new AdminOrderLifecycleActionError(
      'ORDER_NOT_FOUND',
      'Order not found.',
      404
    );
  }

  if (current.shippingRequired !== true) {
    throw invalid(
      'ORDER_COMPLETE_REQUIRES_SHIPPING',
      'Only shippable orders can be completed.'
    );
  }

  if (
    current.shippingProvider !== 'nova_poshta' ||
    !current.shippingMethodCode
  ) {
    throw invalid(
      'ORDER_COMPLETE_NOT_ALLOWED',
      'Order cannot be completed in current state.'
    );
  }

  if (current.shippingStatus === 'delivered') {
    await writeLifecycleAuditNonBlocking({
      orderId: current.id,
      requestId: args.requestId,
      action: 'complete',
      write: () =>
        repairCompleteAudit({
          current,
          actorUserId: args.actorUserId,
          requestId: args.requestId,
        }),
    });

    return {
      action: 'complete',
      orderId: current.id,
      changed: false,
      status: current.status,
      paymentStatus: current.paymentStatus,
      shippingStatus: current.shippingStatus,
    };
  }

  try {
    shippingEligibilityOrThrow(args.orderId, current);
  } catch (error) {
    if (error instanceof OrderStateInvalidError) {
      throw invalid(
        'ORDER_COMPLETE_NOT_ALLOWED',
        'Order cannot be completed in current state.'
      );
    }
    throw error;
  }

  if (current.shipmentStatus !== 'succeeded') {
    throw invalid(
      'ORDER_COMPLETE_SHIPMENT_STATE_INCOMPATIBLE',
      'Order shipment is not ready for completion.'
    );
  }

  if (current.shippingStatus !== 'shipped') {
    throw invalid(
      'ORDER_COMPLETE_NOT_ALLOWED',
      'Order cannot be completed in current state.'
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(orders)
    .set({
      shippingStatus: 'delivered',
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, args.orderId),
        eq(orders.status, 'PAID'),
        eq(orders.paymentStatus, 'paid'),
        eq(orders.inventoryStatus, 'reserved'),
        eq(orders.shippingStatus, 'shipped')
      )
    )
    .returning({ id: orders.id });

  if (!updated) {
    const latest = await loadLifecycleState(args.orderId);
    if (latest?.shippingStatus === 'delivered') {
      await writeLifecycleAuditNonBlocking({
        orderId: latest.id,
        requestId: args.requestId,
        action: 'complete',
        write: () =>
          repairCompleteAudit({
            current: latest,
            actorUserId: args.actorUserId,
            requestId: args.requestId,
          }),
      });

      return {
        action: 'complete',
        orderId: latest.id,
        changed: false,
        status: latest.status,
        paymentStatus: latest.paymentStatus,
        shippingStatus: latest.shippingStatus,
      };
    }

    throw invalid(
      'ORDER_COMPLETE_NOT_ALLOWED',
      'Order cannot be completed in current state.'
    );
  }

  await writeLifecycleAuditNonBlocking({
    orderId: args.orderId,
    requestId: args.requestId,
    action: 'complete',
    write: () =>
      repairCompleteAudit({
        current: {
          ...current,
          shippingStatus: 'delivered',
        },
        actorUserId: args.actorUserId,
        requestId: args.requestId,
        fromShippingStatus: current.shippingStatus,
        fromShipmentStatus: current.shipmentStatus,
      }),
  });

  const latest = await loadLifecycleState(args.orderId);
  if (!latest) throw new OrderNotFoundError('Order not found.');

  return {
    action: 'complete',
    orderId: latest.id,
    changed: true,
    status: latest.status,
    paymentStatus: latest.paymentStatus,
    shippingStatus: latest.shippingStatus,
  };
}

export async function applyAdminOrderLifecycleAction(args: {
  orderId: string;
  action: AdminOrderLifecycleAction;
  actorUserId: string | null;
  requestId: string;
}): Promise<ApplyAdminOrderLifecycleActionResult> {
  if (
    args.action !== 'confirm' &&
    args.action !== 'cancel' &&
    args.action !== 'complete'
  ) {
    logWarn('admin_order_lifecycle_action_unsupported', {
      orderId: args.orderId,
      action: args.action,
      requestId: args.requestId,
    });
    throw new InvalidPayloadError('Unsupported lifecycle action.', {
      code: 'UNSUPPORTED_LIFECYCLE_ACTION',
      details: { action: args.action },
    });
  }

  if (args.action === 'confirm') {
    return applyConfirm(args);
  }

  if (args.action === 'cancel') {
    return applyCancel(args);
  }

  return applyComplete(args);
}
