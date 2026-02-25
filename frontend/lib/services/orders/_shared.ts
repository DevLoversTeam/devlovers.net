import crypto from 'crypto';

import { db } from '@/db';
import { orders } from '@/db/schema/shop';
import { type CurrencyCode } from '@/lib/shop/currency';
import { type PaymentProvider } from '@/lib/shop/payments';
import {
  type CheckoutItem,
  type OrderSummaryWithMinor,
} from '@/lib/types/shop';
import { MAX_QUANTITY_PER_LINE } from '@/lib/validation/shop';

import { InvalidPayloadError, OrderStateInvalidError } from '../errors';

export type OrderRow = typeof orders.$inferSelect;

export type CheckoutItemWithVariant = CheckoutItem & {
  selectedSize?: string | null;
  selectedColor?: string | null;
  variantKey?: string | null;
  options?: Record<string, string> | null;
};

export function normVariant(v?: string | null): string {
  const s = (v ?? '').trim();
  return s;
}

function normalizeOptionKey(key: string): string {
  return key.trim().toLowerCase();
}

function normalizeOptionValue(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeVariantOptions(
  raw: unknown
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const next = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = normalizeOptionKey(rawKey);
    const value = normalizeOptionValue(rawValue);
    if (!key || !value) continue;
    next.set(key, value);
  }

  if (!next.size) return undefined;

  return Object.fromEntries(
    Array.from(next.entries()).sort(([a], [b]) => a.localeCompare(b))
  );
}

function optionValue(
  options: Record<string, string> | undefined,
  keys: string[]
): string | undefined {
  if (!options) return undefined;

  for (const key of keys) {
    const value = options[key];
    if (!value) continue;

    const normalized = normVariant(value);
    if (normalized) return normalized;
  }

  return undefined;
}

export function normalizeCheckoutItem(
  item: CheckoutItemWithVariant
): CheckoutItemWithVariant {
  const normalizedOptions = normalizeVariantOptions(item.options ?? undefined);

  const selectedSize =
    normVariant(item.selectedSize) ||
    optionValue(normalizedOptions, ['size', 'selectedsize']) ||
    undefined;

  const selectedColor =
    normVariant(item.selectedColor) ||
    optionValue(normalizedOptions, ['color', 'selectedcolor']) ||
    undefined;

  const variantKey = normVariant(item.variantKey) || undefined;

  let options = normalizedOptions;
  if (selectedSize || selectedColor) {
    options = {
      ...(options ?? {}),
      ...(selectedSize ? { size: selectedSize } : {}),
      ...(selectedColor ? { color: selectedColor } : {}),
    };
  }

  return {
    ...item,
    selectedSize,
    selectedColor,
    variantKey,
    options: normalizeVariantOptions(options),
  };
}

function checkoutItemMergeKey(item: CheckoutItemWithVariant): string {
  return JSON.stringify({
    productId: item.productId,
    selectedSize: item.selectedSize ?? '',
    selectedColor: item.selectedColor ?? '',
    variantKey: item.variantKey ?? '',
    options: item.options ?? {},
  });
}

export type DbClient = typeof db;

export type Currency = CurrencyCode;

export function resolvePaymentProvider(
  order: Pick<OrderRow, 'paymentProvider' | 'paymentIntentId' | 'paymentStatus'>
): PaymentProvider {
  const provider = order.paymentProvider;

  if (provider === 'stripe' || provider === 'monobank' || provider === 'none')
    return provider;

  if (order.paymentIntentId) return 'stripe';
  if (order.paymentStatus === 'paid') return 'none';

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

export function mergeCheckoutItems(
  items: CheckoutItemWithVariant[]
): CheckoutItemWithVariant[] {
  const map = new Map<string, CheckoutItemWithVariant>();

  for (const item of items) {
    const it = normalizeCheckoutItem(item);
    const key = checkoutItemMergeKey(it);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...it });
      continue;
    }
    const mergedQty = existing.quantity + it.quantity;
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
  locale: string | null;
  paymentProvider: PaymentProvider;
  shipping: {
    provider: 'nova_poshta';
    methodCode: 'NP_WAREHOUSE' | 'NP_LOCKER' | 'NP_COURIER';
    cityRef: string;
    warehouseRef: string | null;
  } | null;
}) {
  const normalized = [...params.items]
    .map(i => {
      const normalizedItem = normalizeCheckoutItem(i);
      return {
        productId: normalizedItem.productId,
        quantity: normalizedItem.quantity,
        variantKey: normalizedItem.variantKey ?? undefined,
        options: normalizedItem.options ?? {},
      };
    })
    .sort((a, b) => {
      const ka = JSON.stringify(a);
      const kb = JSON.stringify(b);
      return ka.localeCompare(kb);
    });

  const payload = JSON.stringify({
    v: 2,
    currency: params.currency,
    locale: normVariant(params.locale).toLowerCase(),
    paymentProvider: params.paymentProvider,
    shipping: params.shipping,
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
