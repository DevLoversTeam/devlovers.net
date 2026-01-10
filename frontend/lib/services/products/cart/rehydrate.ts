import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import {
  calculateLineTotal,
  fromCents,
  toCents,
} from '@/lib/shop/money';
import {
  MAX_QUANTITY_PER_LINE,
  cartRehydrateResultSchema,
} from '@/lib/validation/shop';
import { coercePriceFromDb } from '@/db/queries/shop/orders';
import type {
  CartClientItem,
  CartRehydrateItem,
  CartRehydrateResult,
  CartRemovedItem,
} from '@/lib/validation/shop';
import type { CurrencyCode } from '@/lib/shop/currency';

import { PriceConfigError } from '../../errors';

export async function rehydrateCartItems(
  items: CartClientItem[],
  currency: CurrencyCode
): Promise<CartRehydrateResult> {
  const uniqueProductIds = Array.from(
    new Set(items.map(item => item.productId))
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

  const rehydratedItems: CartRehydrateItem[] = [];
  const removed: CartRemovedItem[] = [];
  let totalCents = 0;

  for (const item of items) {
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

    const effectiveQuantity = Math.min(
      item.quantity,
      product.stock,
      MAX_QUANTITY_PER_LINE
    );

    let unitPriceCents: number;

    if (
      typeof product.priceMinor === 'number' &&
      Number.isFinite(product.priceMinor)
    ) {
      // Critical: DB should store integer minor units; do not truncate
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

      unitPriceCents = product.priceMinor;
    } else {
      // Fallback to legacy money column (string/decimal), still validated via coercePriceFromDb
      unitPriceCents = toCents(
        coercePriceFromDb(product.price, {
          field: 'price',
          productId: product.id,
        })
      );
    }
    // Safety: regardless of source (canonical priceMinor or legacy price),
    // unitPriceCents must be a positive safe integer in minor units.
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 1) {
      throw new PriceConfigError('Invalid price in DB (out of range).', {
        productId: product.id,
        currency,
      });
    }

    const lineTotalCents = calculateLineTotal(
      unitPriceCents,
      effectiveQuantity
    );
    totalCents += lineTotalCents;

    rehydratedItems.push({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      quantity: effectiveQuantity,

      // canonical:
      unitPriceMinor: unitPriceCents,
      lineTotalMinor: lineTotalCents,
      // display:
      unitPrice: fromCents(unitPriceCents),
      lineTotal: fromCents(lineTotalCents),

      // policy: items currency should match resolved currency
      currency,

      stock: product.stock,
      badge: product.badge ?? 'NONE',
      imageUrl: product.imageUrl,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    });
  }

  const itemCount = rehydratedItems.reduce((total, i) => total + i.quantity, 0);

  return cartRehydrateResultSchema.parse({
    items: rehydratedItems,
    removed,
    // IMPORTANT: MINOR units (integer)
    summary: {
      // canonical:
      totalAmountMinor: totalCents,
      // display:
      totalAmount: fromCents(totalCents),
      itemCount,
      currency,
    },
  });
}
