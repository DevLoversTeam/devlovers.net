import { z } from 'zod';

import { logWarn } from '@/lib/logging';
import { createCartItemKey } from '@/lib/shop/cart-item-key';
import { fromCents } from '@/lib/shop/money';
import {
  type CartClientItem as ValidationCartClientItem,
  cartClientItemSchema,
  type CartRehydrateItem,
  type CartRehydrateResult,
  cartRehydrateResultSchema,
  type CartRemovedItem,
  MAX_QUANTITY_PER_LINE,
} from '@/lib/validation/shop';

const CART_KEY = 'devlovers-cart';

export type Cart = CartRehydrateResult;
export type CartItem = CartRehydrateItem;
export type CartSummary = CartRehydrateResult['summary'];
export type CartClientItem = ValidationCartClientItem;

export const emptyCart: Cart = {
  items: [],
  removed: [],
  summary: {
    totalAmountMinor: 0,
    totalAmount: 0,
    itemCount: 0,
    currency: 'USD',
  },
};

const legacyStoredProductSchema = z.object({
  id: z.string(),
});

const legacyStoredCartItemSchema = z.object({
  product: legacyStoredProductSchema,
  quantity: z.union([z.number(), z.string()]).transform(value => {
    const parsed =
      typeof value === 'string' ? parseInt(value, 10) : Math.trunc(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.min(parsed, MAX_QUANTITY_PER_LINE);
  }),
  selectedSize: z.string().optional(),
  selectedColor: z.string().optional(),
});

export { createCartItemKey };

export function capQuantityByStock(quantity: number, stock: number): number {
  return Math.max(
    0,
    Math.min(quantity, Math.max(stock, 0), MAX_QUANTITY_PER_LINE)
  );
}

function normalizeStoredItem(rawItem: unknown): CartClientItem | null {
  const parsed = cartClientItemSchema.safeParse(rawItem);
  if (parsed.success) return parsed.data;

  const legacy = legacyStoredCartItemSchema.safeParse(rawItem);
  if (legacy.success) {
    return {
      productId: legacy.data.product.id,
      quantity: legacy.data.quantity,
      selectedSize: legacy.data.selectedSize,
      selectedColor: legacy.data.selectedColor,
    };
  }

  return null;
}

export function getStoredCartItems(): CartClientItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(CART_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(item => normalizeStoredItem(item))
      .filter((item): item is CartClientItem => item !== null);
  } catch (error) {
    logWarn('cart_read_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function persistCartItems(items: CartClientItem[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (error) {
    logWarn('cart_save_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeItemsForStorage(
  items: CartRehydrateItem[]
): CartClientItem[] {
  return items.map(item => ({
    productId: item.productId,
    quantity: item.quantity,
    selectedSize: item.selectedSize,
    selectedColor: item.selectedColor,
  }));
}

export function computeSummaryFromItems(
  items: CartRehydrateItem[]
): CartSummary {
  if (!items.length) {
    return {
      totalAmountMinor: 0,
      totalAmount: 0,
      itemCount: 0,
      currency: 'USD',
    };
  }

  const currency = (items[0]?.currency ?? 'USD') as CartSummary['currency'];

  let totalMinor = 0;
  let itemCount = 0;

  for (const item of items) {
    if (item.currency !== currency) {
      throw new Error(
        `Cart contains mixed currencies (${currency} and ${item.currency}). Clear cart and try again.`
      );
    }

    totalMinor += item.lineTotalMinor;
    itemCount += item.quantity;
  }

  return {
    totalAmountMinor: totalMinor,
    totalAmount: fromCents(totalMinor),
    itemCount,
    currency,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractApiError(data: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (isRecord(data) && typeof data.error === 'string') {
    return { code: 'UNKNOWN_ERROR', message: data.error };
  }
  if (isRecord(data) && isRecord(data.error)) {
    const errObj = data.error;
    const code =
      typeof errObj.code === 'string' && errObj.code.trim().length > 0
        ? errObj.code
        : 'UNKNOWN_ERROR';
    const message =
      typeof errObj.message === 'string' && errObj.message.trim().length > 0
        ? errObj.message
        : 'Request failed';
    return { code, message, details: errObj.details };
  }
  if (isRecord(data)) {
    const code =
      typeof data.code === 'string' && data.code.trim().length > 0
        ? data.code
        : 'UNKNOWN_ERROR';
    const message =
      typeof data.message === 'string' && data.message.trim().length > 0
        ? data.message
        : 'Request failed';
    if (typeof data.code === 'string' || typeof data.message === 'string') {
      return { code, message, details: data.details };
    }
  }

  return { code: 'UNKNOWN_ERROR', message: 'Unable to rehydrate cart' };
}

export class CartRehydrateError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(args.message);
    this.name = 'CartRehydrateError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

async function readJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function rehydrateCart(items: CartClientItem[]): Promise<Cart> {
  if (!items.length) {
    persistCartItems([]);
    return emptyCart;
  }

  const response = await fetch('/api/shop/cart/rehydrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  const data = await readJsonSafe(response);

  if (!response.ok) {
    const apiErr = extractApiError(data);
    throw new CartRehydrateError({
      code: apiErr.code,
      message:
        apiErr.message || `Unable to rehydrate cart (HTTP ${response.status})`,
      status: response.status,
      details: apiErr.details,
    });
  }

  const parsed = cartRehydrateResultSchema.parse(data);
  const normalizedForStorage = normalizeItemsForStorage(parsed.items);
  persistCartItems(normalizedForStorage);

  return parsed;
}

export function buildCartFromItems(
  items: CartRehydrateItem[],
  removed: CartRemovedItem[] = []
): Cart {
  const summary = computeSummaryFromItems(items);
  return { items, removed, summary };
}

export function clearStoredCart(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CART_KEY);
  }
}
