import { sql, type SQL } from 'drizzle-orm';

export const ORDER_NON_PAYMENT_STATUSES = [
  'CREATED',
  'INVENTORY_RESERVED',
  'INVENTORY_FAILED',
  'PAID',
  'CANCELED',
] as const;

export type OrderNonPaymentStatus = (typeof ORDER_NON_PAYMENT_STATUSES)[number];

const ORDER_NON_PAYMENT_ALLOWED_FROM: Record<
  OrderNonPaymentStatus,
  readonly OrderNonPaymentStatus[]
> = {
  CREATED: [],
  INVENTORY_RESERVED: ['CREATED'],
  INVENTORY_FAILED: ['CREATED', 'INVENTORY_RESERVED', 'PAID', 'INVENTORY_FAILED'],
  PAID: [],
  CANCELED: ['CREATED', 'INVENTORY_RESERVED', 'INVENTORY_FAILED', 'PAID', 'CANCELED'],
};

export function allowedFromOrderNonPaymentStatus(
  to: OrderNonPaymentStatus,
  options?: { includeSame?: boolean }
): readonly OrderNonPaymentStatus[] {
  const from = ORDER_NON_PAYMENT_ALLOWED_FROM[to];
  if (!options?.includeSame) return from;
  return Array.from(new Set([...from, to]));
}

export function isOrderNonPaymentStatusTransitionAllowed(
  from: string | null | undefined,
  to: OrderNonPaymentStatus,
  options?: { includeSame?: boolean }
): boolean {
  if (!from) return false;
  const allowed = allowedFromOrderNonPaymentStatus(to, options);
  return allowed.includes(from as OrderNonPaymentStatus);
}

export function orderNonPaymentTransitionWhereSql(args: {
  column: SQL;
  to: OrderNonPaymentStatus;
  includeSame?: boolean;
}): SQL {
  const from = allowedFromOrderNonPaymentStatus(args.to, {
    includeSame: args.includeSame,
  });
  if (from.length === 0) return sql`false`;
  return sql`${args.column} in (${sql.join(from.map(v => sql`${v}`), sql`, `)})`;
}

export const ORDER_QUOTE_STATUSES = [
  'none',
  'requested',
  'offered',
  'accepted',
  'declined',
  'expired',
  'requires_requote',
] as const;

export type OrderQuoteStatus = (typeof ORDER_QUOTE_STATUSES)[number];

const ORDER_QUOTE_ALLOWED_FROM: Record<
  OrderQuoteStatus,
  readonly OrderQuoteStatus[]
> = {
  none: [],
  requested: ['none', 'declined', 'expired', 'requires_requote'],
  offered: ['none', 'requested', 'declined', 'expired', 'requires_requote'],
  accepted: ['offered'],
  declined: ['offered'],
  expired: ['offered'],
  requires_requote: ['offered', 'accepted'],
};

export function allowedFromOrderQuoteStatus(
  to: OrderQuoteStatus,
  options?: { includeSame?: boolean }
): readonly OrderQuoteStatus[] {
  const from = ORDER_QUOTE_ALLOWED_FROM[to];
  if (!options?.includeSame) return from;
  return Array.from(new Set([...from, to]));
}

export function isOrderQuoteStatusTransitionAllowed(
  from: string | null | undefined,
  to: OrderQuoteStatus,
  options?: { includeSame?: boolean }
): boolean {
  if (!from) return false;
  const allowed = allowedFromOrderQuoteStatus(to, options);
  return allowed.includes(from as OrderQuoteStatus);
}

export function orderQuoteTransitionWhereSql(args: {
  column: SQL;
  to: OrderQuoteStatus;
  includeSame?: boolean;
}): SQL {
  const from = allowedFromOrderQuoteStatus(args.to, {
    includeSame: args.includeSame,
  });
  if (from.length === 0) return sql`false`;
  return sql`${args.column} in (${sql.join(from.map(v => sql`${v}`), sql`, `)})`;
}

export const __orderTransitionMatrix = {
  nonPayment: ORDER_NON_PAYMENT_ALLOWED_FROM,
  quote: ORDER_QUOTE_ALLOWED_FROM,
};
