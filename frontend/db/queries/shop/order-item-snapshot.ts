import { orderItems } from '@/db/schema';

const snapshotProjection = {
  id: orderItems.id,
  productId: orderItems.productId,
  productTitle: orderItems.productTitle,
  productSlug: orderItems.productSlug,
  productSku: orderItems.productSku,
  quantity: orderItems.quantity,
};

export const customerOrderItemProjection = {
  ...snapshotProjection,
  unitPrice: orderItems.unitPrice,
  lineTotal: orderItems.lineTotal,
};

export const adminOrderItemProjection = {
  ...snapshotProjection,
  unitPriceMinor: orderItems.unitPriceMinor,
  lineTotalMinor: orderItems.lineTotalMinor,
};

export type CustomerOrderItem = Pick<
  typeof orderItems.$inferSelect,
  keyof typeof customerOrderItemProjection
>;

type JoinedCustomerOrderItem = {
  [Field in keyof CustomerOrderItem]: CustomerOrderItem[Field] | null;
};

export function toCustomerOrderItem(
  item: JoinedCustomerOrderItem | null
): CustomerOrderItem | null {
  if (!item || !item.id) return null;

  if (
    !item.productId ||
    item.quantity === null ||
    !item.unitPrice ||
    !item.lineTotal
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
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}
