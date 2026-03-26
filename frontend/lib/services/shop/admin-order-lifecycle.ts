import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { orders, shippingShipments } from '@/db/schema';
import { logWarn } from '@/lib/logging';
import {
  InvalidPayloadError,
  OrderNotFoundError,
  OrderStateInvalidError,
} from '@/lib/services/errors';
import { cancelMonobankUnpaidPayment } from '@/lib/services/orders/monobank-cancel-payment';
import { restockOrder } from '@/lib/services/orders/restock';
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
    return {
      action: 'confirm',
      orderId: current.id,
      changed: false,
      status: current.status,
      paymentStatus: current.paymentStatus,
      shippingStatus: current.shippingStatus,
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
      return {
        action: 'confirm',
        orderId: latest.id,
        changed: false,
        status: latest.status,
        paymentStatus: latest.paymentStatus,
        shippingStatus: latest.shippingStatus,
      };
    }

    throw invalid(
      'ORDER_CONFIRM_NOT_ALLOWED',
      'Order cannot be confirmed in current state.'
    );
  }

  const shipmentSync =
    current.shippingRequired === true &&
    current.shippingProvider === 'nova_poshta' &&
    current.shippingMethodCode
      ? await ensureQueuedInitialShipment({
          now,
          orderId: args.orderId,
          paymentProvider: toSupportedShipmentProvider(current.paymentProvider),
        })
      : {
          insertedShipment: false,
          queuedShipment: false,
          updatedOrder: false,
        };

  await writeAdminAudit({
    orderId: args.orderId,
    actorUserId: args.actorUserId,
    action: 'order_admin_action.confirm',
    targetType: 'order',
    targetId: args.orderId,
    requestId: args.requestId,
    payload: {
      action: 'confirm',
      fromStatus: current.status,
      toStatus: 'PAID',
      paymentStatus: current.paymentStatus,
      insertedShipment: shipmentSync.insertedShipment,
      queuedShipment: shipmentSync.queuedShipment,
      updatedShippingStatus: shipmentSync.updatedOrder,
    },
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
    await cancelMonobankUnpaidPayment({
      orderId: args.orderId,
      requestId: args.requestId,
    });
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
    await writeAdminAudit({
      orderId: args.orderId,
      actorUserId: args.actorUserId,
      action: 'order_admin_action.cancel',
      targetType: 'order',
      targetId: args.orderId,
      requestId: args.requestId,
      payload: {
        action: 'cancel',
        fromStatus: current.status,
        toStatus: latest.status,
        fromPaymentStatus: current.paymentStatus,
        toPaymentStatus: latest.paymentStatus,
        fromShippingStatus: current.shippingStatus,
        toShippingStatus: latest.shippingStatus,
      },
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

  await writeAdminAudit({
    orderId: args.orderId,
    actorUserId: args.actorUserId,
    action: 'order_admin_action.complete',
    targetType: 'order',
    targetId: args.orderId,
    requestId: args.requestId,
    payload: {
      action: 'complete',
      fromShippingStatus: current.shippingStatus,
      toShippingStatus: 'delivered',
      fromShipmentStatus: current.shipmentStatus,
    },
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
