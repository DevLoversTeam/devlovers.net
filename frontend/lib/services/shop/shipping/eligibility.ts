import { and, eq, inArray, type SQL, type SQLWrapper } from 'drizzle-orm';

import {
  inventoryCommittedForShippingSql,
  isInventoryCommittedForShipping,
} from '@/lib/services/shop/shipping/inventory-eligibility';

const SHIPPABLE_PAYMENT_STATUS = 'paid';
const SHIPPABLE_ORDER_STATUSES = ['PAID'] as const;

export type OrderShippingEligibilityInput = {
  paymentStatus: string | null | undefined;
  orderStatus: string | null | undefined;
  inventoryStatus: string | null | undefined;
};

export type OrderShippingEligibilityFailureCode =
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
}): SQL {
  return and(
    eq(args.paymentStatusColumn, SHIPPABLE_PAYMENT_STATUS),
    inArray(args.orderStatusColumn, SHIPPABLE_ORDER_STATUSES),
    inventoryCommittedForShippingSql(args.inventoryStatusColumn)
  ) as SQL;
}

