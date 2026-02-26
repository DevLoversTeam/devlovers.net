import { type SQL, sql, type SQLWrapper } from 'drizzle-orm';

import { inventoryStatusEnum } from '@/db/schema/shop';

export type InventoryStatusValue =
  (typeof inventoryStatusEnum.enumValues)[number];

const INVENTORY_COMMITTED_FOR_SHIPPING: readonly InventoryStatusValue[] = [
  'reserved',
];

export function getInventoryCommittedForShippingStatuses(): readonly InventoryStatusValue[] {
  return INVENTORY_COMMITTED_FOR_SHIPPING;
}

export function isInventoryCommittedForShipping(
  status: InventoryStatusValue | string | null | undefined
): boolean {
  if (!status) return false;
  return INVENTORY_COMMITTED_FOR_SHIPPING.includes(
    status as InventoryStatusValue
  );
}

export function inventoryCommittedForShippingSql(
  columnReference: SQLWrapper
): SQL {
  return sql`${columnReference} in (${sql.join(
    INVENTORY_COMMITTED_FOR_SHIPPING.map(value => sql`${value}`),
    sql`, `
  )})`;
}
