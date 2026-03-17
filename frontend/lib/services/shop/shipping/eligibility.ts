import { and, eq, inArray, type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import {
  inventoryCommittedForShippingSql,
  isInventoryCommittedForShipping,
} from '@/lib/services/shop/shipping/inventory-eligibility';

const SHIPPABLE_PAYMENT_STATUS = 'paid';
const SHIPPABLE_ORDER_STATUSES = ['PAID'] as const;
const REFUND_CONTAINMENT_REASON = 'REFUND_REQUESTED';

export type OrderShippingEligibilityInput = {
  paymentStatus: string | null | undefined;
  orderStatus: string | null | undefined;
  inventoryStatus: string | null | undefined;
  pspStatusReason?: string | null | undefined;
};

export type OrderShippingEligibilityFailureCode =
  | 'REFUND_CONTAINED'
  | 'PAYMENT_NOT_PAID'
  | 'ORDER_NOT_FULFILLABLE'
  | 'INVENTORY_NOT_COMMITTED';

type OrderShippingEligibilityFailure = {
  ok: false;
  code: OrderShippingEligibilityFailureCode;
  message: string;
};

type OrderShippingEligibilitySuccess = {
  ok: true;
};

export type OrderShippingEligibilityResult =
  | OrderShippingEligibilitySuccess
  | OrderShippingEligibilityFailure;

export function evaluateOrderShippingEligibility(
  state: OrderShippingEligibilityInput
): OrderShippingEligibilityResult {
  if (state.pspStatusReason === REFUND_CONTAINMENT_REASON) {
    return {
      ok: false,
      code: 'REFUND_CONTAINED',
      message: 'Order refund is pending finalization.',
    };
  }

  if (state.paymentStatus !== SHIPPABLE_PAYMENT_STATUS) {
    return {
      ok: false,
      code: 'PAYMENT_NOT_PAID',
      message: 'Order payment status is not paid.',
    };
  }

  if (!SHIPPABLE_ORDER_STATUSES.includes(state.orderStatus as 'PAID')) {
    return {
      ok: false,
      code: 'ORDER_NOT_FULFILLABLE',
      message: 'Order is not in a fulfillable status.',
    };
  }

  if (!isInventoryCommittedForShipping(state.inventoryStatus)) {
    return {
      ok: false,
      code: 'INVENTORY_NOT_COMMITTED',
      message: 'Order inventory is not committed for shipping.',
    };
  }

  return { ok: true };
}

export function orderShippingEligibilityWhereSql(args: {
  paymentStatusColumn: SQLWrapper;
  orderStatusColumn: SQLWrapper;
  inventoryStatusColumn: SQLWrapper;
  pspStatusReasonColumn?: SQLWrapper;
}): SQL {
  return and(
    args.pspStatusReasonColumn
      ? sql`${args.pspStatusReasonColumn} is distinct from ${REFUND_CONTAINMENT_REASON}`
      : undefined,
    eq(args.paymentStatusColumn, SHIPPABLE_PAYMENT_STATUS),
    inArray(args.orderStatusColumn, SHIPPABLE_ORDER_STATUSES),
    inventoryCommittedForShippingSql(args.inventoryStatusColumn)
  ) as SQL;
}

