import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
import { productPrices, products } from '@/db/schema';
import { logWarn } from '@/lib/logging';
import { createCartItemKey } from '@/lib/shop/cart-item-key';
import { type CurrencyCode, isTwoDecimalCurrency } from '@/lib/shop/currency';
import { calculateLineTotal, fromCents, toCents } from '@/lib/shop/money';
import type {
  CartClientItem,
  CartRehydrateItem,
  CartRehydrateResult,
  CartRemovedItem,
} from '@/lib/validation/shop';
import {
  cartRehydrateResultSchema,
  MAX_QUANTITY_PER_LINE,
} from '@/lib/validation/shop';

import { PriceConfigError } from '../../errors';

const fromMinorUnits = fromCents;

function assertTwoDecimalCurrency(currency: CurrencyCode): void {
  if (isTwoDecimalCurrency(currency)) return;

  throw new PriceConfigError(
    'Unsupported currency minor units exponent in cart rehydrate (expected 2-decimal currency).',
    {
      productId: '__cart__',
      currency,
    }
  );
}

const MAX_VARIANT_LENGTH = 64;

function normalizeVariant(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_VARIANT_LENGTH) return undefined;
  return trimmed;
}

function sanitizeVariant(
  value: string | undefined,
  allowed: string[] | null | undefined
): string | undefined {
  if (!value) return undefined;

  const list = Array.isArray(allowed)
    ? allowed.filter(v => typeof v === 'string' && v.trim().length > 0)
    : [];

  if (list.length === 0) return undefined;
  return list.includes(value) ? value : undefined;
}

type NormalizedCartLine = {
  productId: string;
  quantity: number;
  selectedSize?: string;
  selectedColor?: string;
};

function aggregateClientLines(items: CartClientItem[]): NormalizedCartLine[] {
  const map = new Map<string, NormalizedCartLine>();

  for (const item of items) {
    const selectedSize = normalizeVariant(item.selectedSize);
    const selectedColor = normalizeVariant(item.selectedColor);

    const key = createCartItemKey(item.productId, selectedSize, selectedColor);
    const prev = map.get(key);

    if (prev) {
      prev.quantity += item.quantity;
    } else {
      map.set(key, {
        productId: item.productId,
        quantity: item.quantity,
        selectedSize,
        selectedColor,
      });
    }
  }

  return Array.from(map.values());
}

export async function rehydrateCartItems(
  items: CartClientItem[],
  currency: CurrencyCode
): Promise<CartRehydrateResult> {
  assertTwoDecimalCurrency(currency);

  const aggregated = aggregateClientLines(items);

  const uniqueProductIds = Array.from(
    new Set(aggregated.map(item => item.productId))
  );
  if (uniqueProductIds.length === 0) {
    return cartRehydrateResultSchema.parse({
      items: [],
      removed: [],
      summary: { totalAmountMinor: 0, totalAmount: 0, itemCount: 0, currency },
    });
  }

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      stock: products.stock,
      isActive: products.isActive,
      badge: products.badge,
      imageUrl: products.imageUrl,
      colors: products.colors,
      sizes: products.sizes,
      priceMinor: productPrices.priceMinor,
      price: productPrices.price,
      priceCurrency: productPrices.currency,
    })
    .from(products)
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.currency, currency)
      )
    )
    .where(inArray(products.id, uniqueProductIds));

  const productMap = new Map(rows.map(r => [r.id, r]));
  const removed: CartRemovedItem[] = [];
  const merged = new Map<
    string,
    Omit<
      CartRehydrateItem,
      'quantity' | 'lineTotalMinor' | 'lineTotal' | 'unitPrice' | 'lineTotal'
    > & {
      desiredQuantity: number;
      unitPriceMinor: number;
    }
  >();

  for (const item of aggregated) {
    const product = productMap.get(item.productId);

    if (!product) {
      removed.push({ productId: item.productId, reason: 'not_found' });
      continue;
    }

    if (!product.isActive) {
      removed.push({ productId: item.productId, reason: 'inactive' });
      continue;
    }

    if (product.stock <= 0) {
      removed.push({ productId: item.productId, reason: 'out_of_stock' });
      continue;
    }

    if (
      !product.priceCurrency ||
      (product.priceMinor == null && product.price == null)
    ) {
      throw new PriceConfigError('Price not configured for currency.', {
        productId: product.id,
        currency,
      });
    }

    let unitPriceMinor: number;

    if (
      typeof product.priceMinor === 'number' &&
      Number.isFinite(product.priceMinor)
    ) {
      if (!Number.isInteger(product.priceMinor)) {
        throw new PriceConfigError(
          'Invalid priceMinor in DB (must be integer).',
          {
            productId: product.id,
            currency,
          }
        );
      }
      if (!Number.isSafeInteger(product.priceMinor) || product.priceMinor < 1) {
        throw new PriceConfigError('Invalid priceMinor in DB (out of range).', {
          productId: product.id,
          currency,
        });
      }

      unitPriceMinor = product.priceMinor;
    } else {
      unitPriceMinor = toCents(
        coercePriceFromDb(product.price, {
          field: 'price',
          productId: product.id,
        })
      );
    }

    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 1) {
      throw new PriceConfigError('Invalid price in DB (out of range).', {
        productId: product.id,
        currency,
      });
    }

    const sanitizedSize = sanitizeVariant(item.selectedSize, product.sizes);
    const sanitizedColor = sanitizeVariant(item.selectedColor, product.colors);

    if (
      sanitizedSize !== item.selectedSize ||
      sanitizedColor !== item.selectedColor
    ) {
      logWarn('cart_rehydrate_variant_sanitized', {
        productId: product.id,
        currency,
        droppedSize:
          item.selectedSize && sanitizedSize !== item.selectedSize
            ? item.selectedSize
            : undefined,
        droppedColor:
          item.selectedColor && sanitizedColor !== item.selectedColor
            ? item.selectedColor
            : undefined,
      });
    }

    const key = createCartItemKey(product.id, sanitizedSize, sanitizedColor);

    const prev = merged.get(key);
    if (prev) {
      prev.desiredQuantity += item.quantity;
    } else {
      merged.set(key, {
        productId: product.id,
        slug: product.slug,
        title: product.title,
        currency,
        stock: product.stock,
        badge: product.badge ?? 'NONE',
        imageUrl: product.imageUrl,
        selectedSize: sanitizedSize,
        selectedColor: sanitizedColor,
        desiredQuantity: item.quantity,
        unitPriceMinor,
      });
    }
  }

  const rehydratedItems: CartRehydrateItem[] = [];
  let totalMinor = 0;

  for (const line of merged.values()) {
    const effectiveQuantity = Math.min(
      line.desiredQuantity,
      line.stock,
      MAX_QUANTITY_PER_LINE
    );

    const lineTotalMinor = calculateLineTotal(
      line.unitPriceMinor,
      effectiveQuantity
    );
    totalMinor += lineTotalMinor;

    rehydratedItems.push({
      productId: line.productId,
      slug: line.slug,
      title: line.title,
      quantity: effectiveQuantity,

      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor,

      unitPrice: fromMinorUnits(line.unitPriceMinor),
      lineTotal: fromMinorUnits(lineTotalMinor),

      currency: line.currency,

      stock: line.stock,
      badge: line.badge,
      imageUrl: line.imageUrl,
      selectedSize: line.selectedSize,
      selectedColor: line.selectedColor,
    });
  }

  const itemCount = rehydratedItems.reduce((total, i) => total + i.quantity, 0);

  return cartRehydrateResultSchema.parse({
    items: rehydratedItems,
    removed,
    summary: {
      totalAmountMinor: totalMinor,
      totalAmount: fromMinorUnits(totalMinor),
      itemCount,
      currency,
    },
  });
}
