import { type SQL, sql } from 'drizzle-orm';

export const SHIPPING_STATUSES = [
  'pending',
  'queued',
  'creating_label',
  'label_created',
  'shipped',
  'delivered',
  'cancelled',
  'needs_attention',
] as const;

export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];

const SHIPPING_ALLOWED_FROM: Record<ShippingStatus, readonly ShippingStatus[]> =
  {
    pending: [],
    queued: ['pending', 'queued', 'creating_label', 'needs_attention'],
    creating_label: ['pending', 'queued', 'creating_label'],
    label_created: ['pending', 'queued', 'creating_label'],
    shipped: ['label_created'],
    delivered: ['shipped'],
    cancelled: [
      'pending',
      'queued',
      'creating_label',
      'label_created',
      'shipped',
    ],
    needs_attention: ['pending', 'queued', 'creating_label', 'needs_attention'],
  };
Object.values(SHIPPING_ALLOWED_FROM).forEach(arr => {
  Object.freeze(arr);
});
Object.freeze(SHIPPING_ALLOWED_FROM);

export function allowedFromShippingStatus(
  to: ShippingStatus,
  options?: { includeSame?: boolean }
): readonly ShippingStatus[] {
  const from = SHIPPING_ALLOWED_FROM[to];
  if (!options?.includeSame) return from;
  return Array.from(new Set([...from, to]));
}

export function isShippingStatusTransitionAllowed(
  from: string | null | undefined,
  to: ShippingStatus,
  options?: { allowNullFrom?: boolean; includeSame?: boolean }
): boolean {
  if (from == null) return options?.allowNullFrom === true;
  const allowed = allowedFromShippingStatus(to, options);
  return allowed.includes(from as ShippingStatus);
}

export function shippingStatusTransitionWhereSql(args: {
  column: SQL;
  to: ShippingStatus;
  allowNullFrom?: boolean;
  includeSame?: boolean;
}): SQL {
  const from = allowedFromShippingStatus(args.to, {
    includeSame: args.includeSame,
  });
  const inAllowed =
    from.length > 0
      ? sql`${args.column} in (${sql.join(
          from.map(v => sql`${v}`),
          sql`, `
        )})`
      : sql`false`;

  if (args.allowNullFrom) {
    return sql`(${args.column} is null or ${inAllowed})`;
  }
  return inAllowed;
}

export const __shippingTransitionMatrix = SHIPPING_ALLOWED_FROM;
