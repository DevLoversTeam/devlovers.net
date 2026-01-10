import crypto from 'crypto';

import { createCartItemKey } from '@/lib/shop/cart-item-key';
import { type PaymentProvider } from '@/lib/shop/payments';
import { type CurrencyCode } from '@/lib/shop/currency';
import { MAX_QUANTITY_PER_LINE } from '@/lib/validation/shop';
import { type CheckoutItem, type OrderSummaryWithMinor } from '@/lib/types/shop';
import { orders } from '@/db/schema/shop';
import { db } from '@/db';

import { InvalidPayloadError, OrderStateInvalidError } from '../errors';

export type OrderRow = typeof orders.$inferSelect;

export type CheckoutItemWithVariant = CheckoutItem & {
  selectedSize?: string | null;
  selectedColor?: string | null;
};

export function normVariant(v?: string | null): string {
  const s = (v ?? '').trim();
  return s;
}

export type DbClient = typeof db;

export type Currency = CurrencyCode;

export function resolvePaymentProvider(
  order: Pick<OrderRow, 'paymentProvider' | 'paymentIntentId' | 'paymentStatus'>
): PaymentProvider {
  const provider = order.paymentProvider;

  if (provider === 'stripe' || provider === 'none') return provider;

  // legacy / corrupted data fallback:
  if (order.paymentIntentId) return 'stripe';
  if (order.paymentStatus === 'paid') return 'none';

  // safest default: treat as stripe to avoid skipping payment flows
  return 'stripe';
}

export function requireTotalCents(summary: OrderSummaryWithMinor): number {
  const v = summary.totalAmountMinor;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      'Order summary missing totalAmountMinor (server invariant violated).'
    );
  }
  return v;
}

export function mergeCheckoutItems(items: CheckoutItem[]): CheckoutItem[] {
  const map = new Map<string, CheckoutItemWithVariant>();

  for (const item of items) {
    const it = item as CheckoutItemWithVariant;
    const selectedSize = normVariant(it.selectedSize);
    const selectedColor = normVariant(it.selectedColor);
    const key = createCartItemKey(item.productId, selectedSize, selectedColor);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...it, selectedSize, selectedColor });
      continue;
    }
    const mergedQty = existing.quantity + item.quantity;
    if (mergedQty > MAX_QUANTITY_PER_LINE) {
      throw new InvalidPayloadError('Quantity exceeds maximum per line.');
    }
    existing.quantity = mergedQty;
  }

  return Array.from(map.values());
}

export function aggregateReserveByProductId(
  items: Array<{ productId: string; quantity: number }>
): Array<{ productId: string; quantity: number }> {
  const agg = new Map<string, number>();
  for (const it of items) {
    agg.set(it.productId, (agg.get(it.productId) ?? 0) + it.quantity);
  }
  return Array.from(agg.entries())
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function hashIdempotencyRequest(params: {
  items: CheckoutItemWithVariant[];
  currency: string;
  userId: string | null;
}) {
  // Stable canonical form:
  const normalized = [...params.items]
    .map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      selectedSize: normVariant(i.selectedSize),
      selectedColor: normVariant(i.selectedColor),
    }))
    .sort((a, b) => {
      const ka = createCartItemKey(
        a.productId,
        a.selectedSize ?? undefined,
        a.selectedColor ?? undefined
      );
      const kb = createCartItemKey(
        b.productId,
        b.selectedSize ?? undefined,
        b.selectedColor ?? undefined
      );
      return ka.localeCompare(kb);
    });

  const payload = JSON.stringify({
    v: 1,
    currency: params.currency,
    userId: params.userId,
    items: normalized,
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function isStrictNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

export function requireMinor(
  value: unknown,
  ctx: { orderId: string; field: string }
): number {
  if (isStrictNonNegativeInt(value)) return value;

  throw new OrderStateInvalidError(
    `Order ${ctx.orderId} has invalid minor units in field "${ctx.field}"`,
    { orderId: ctx.orderId, field: ctx.field, rawValue: value }
  );
}
