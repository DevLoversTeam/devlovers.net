import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';

import {
  destroyProductImage,
  uploadProductImageFromFile,
} from '@/lib/cloudinary';
import { db } from '@/db';
import { products, productPrices } from '@/db/schema';
import { logError } from '@/lib/logging';
import {
  calculateLineTotal,
  fromCents,
  fromDbMoney,
  toCents,
  toDbMoney,
} from '@/lib/shop/money';
import { slugify } from '@/lib/shop/slug';
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
import { currencyValues } from '@/lib/shop/currency';
import type { CurrencyCode } from '@/lib/shop/currency';

import type {
  DbProduct,
  ProductInput,
  ProductUpdateInput,
} from '@/lib/types/shop';
import {
  InvalidPayloadError,
  PriceConfigError,
  SlugConflictError,
} from './errors';

export type AdminProductsFilter = {
  isActive?: boolean;
  category?: string;
  type?: string;
};

type ProductsTable = typeof products;
type ProductRow = ProductsTable['$inferSelect'];
type DbClient = typeof db;

type NormalizedPriceRow = {
  currency: CurrencyCode;
  priceMinor: number;
  originalPriceMinor: number | null;
};

function randomSuffix(length = 6) {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

async function ensureUniqueSlug(
  db: DbClient,
  baseSlug: string,
  options?: { excludeId?: string }
): Promise<string> {
  let candidate = baseSlug;
  let attempts = 0;

  while (true) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(
        options?.excludeId
          ? and(
              eq(products.slug, candidate),
              ne(products.id, options.excludeId)
            )
          : eq(products.slug, candidate)
      )
      .limit(1);

    if (!existing.length) return candidate;

    attempts += 1;
    if (attempts > 10) {
      throw new SlugConflictError('Unable to generate unique slug');
    }

    candidate = `${baseSlug}-${randomSuffix()}`;
  }
}

async function normalizeSlug(
  db: DbClient,
  slug: string,
  options?: { excludeId?: string }
) {
  const normalized = slugify(slug);
  if (!normalized) {
    throw new SlugConflictError('Slug could not be generated');
  }
  return ensureUniqueSlug(db, normalized, options);
}

function mapRowToProduct(row: ProductRow): DbProduct {
  const priceCents = fromDbMoney(row.price);
  const originalPriceCents =
    row.originalPrice == null ? undefined : fromDbMoney(row.originalPrice);

  return {
    ...row,
    description: row.description ?? undefined,
    price: fromCents(priceCents),
    originalPrice:
      originalPriceCents == null ? undefined : fromCents(originalPriceCents),
    imagePublicId: row.imagePublicId ?? undefined,
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    type: row.type ?? undefined,
  };
}

function assertMoneyString(value: string, field: string): number {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidPayloadError(`${field} is required.`);
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) {
    throw new InvalidPayloadError(`${field} must be a positive number.`);
  }
  return n;
}

function assertMoneyMinorInt(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(n)) {
    throw new InvalidPayloadError(`${field} must be a number.`);
  }

  // Critical: reject fractional minor units (no truncation)
  if (!Number.isInteger(n)) {
    throw new InvalidPayloadError(`${field} must be an integer (minor units).`);
  }

  if (!Number.isSafeInteger(n) || n < 1) {
    throw new InvalidPayloadError(
      `${field} must be a positive integer (minor units).`
    );
  }

  return n;
}

function assertOptionalMoneyString(
  value: string | null | undefined,
  field: string,
  price: string
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const n = Number(trimmed);
  const p = Number(price);

  if (!Number.isFinite(n) || !Number.isFinite(p)) {
    throw new InvalidPayloadError(`${field} must be a valid number.`);
  }
  if (n <= p) {
    throw new InvalidPayloadError(`${field} must be > price.`);
  }
  return n;
}

function toMoneyMinor(value: string, field: string): number {
  const n = assertMoneyString(value, field);
  return toCents(n);
}

function toMoneyMinorNullable(
  value: string | null | undefined,
  field: string,
  price: string
): number | null {
  const n = assertOptionalMoneyString(value, field, price);
  if (n == null) return null;
  return toCents(n);
}

function normalizePricesFromInput(input: unknown): NormalizedPriceRow[] {
  // Transitional-safe:
  // - NEW: input.prices[] uses MINOR units: { currency, priceMinor, originalPriceMinor }
  // - LEGACY: input.prices[] uses MAJOR strings: { currency, price, originalPrice }
  // - VERY LEGACY: top-level price/originalPrice/currency
  const anyInput = input as any;

  const prices = anyInput?.prices;
  if (Array.isArray(prices) && prices.length) {
    return prices.map((p: any) => {
      const currency = p?.currency as CurrencyCode;
      if (!currencyValues.includes(currency as any)) {
        throw new InvalidPayloadError(
          `Unsupported currency: ${String(p?.currency)}.`
        );
      }

      // NEW path: minor units
      if (p?.priceMinor != null) {
        const priceMinor = assertMoneyMinorInt(
          p.priceMinor,
          `${currency} price`
        );
        const originalPriceMinor =
          p.originalPriceMinor == null
            ? null
            : (() => {
                const v = assertMoneyMinorInt(
                  p.originalPriceMinor,
                  `${currency} originalPrice`
                );
                if (v <= priceMinor) {
                  throw new InvalidPayloadError(
                    `${currency} originalPrice must be > price.`
                  );
                }
                return v;
              })();

        return { currency, priceMinor, originalPriceMinor };
      }

      // LEGACY path: major strings
      const price = String(p?.price ?? '').trim();
      const originalPrice =
        p?.originalPrice == null ? null : String(p.originalPrice).trim();

      if (!price) {
        throw new InvalidPayloadError(`${currency}: price is required.`);
      }

      const priceMinor = toMoneyMinor(price, `${currency} price`);
      const originalPriceMinor = toMoneyMinorNullable(
        originalPrice,
        `${currency} originalPrice`,
        price
      );
      return { currency, priceMinor, originalPriceMinor };
    });
  }

  // Legacy fallback (only if present)
  if (anyInput?.price != null) {
    const currency = (anyInput?.currency as CurrencyCode) ?? 'USD';
    if (!currencyValues.includes(currency as any)) {
      throw new InvalidPayloadError(
        `Unsupported currency: ${String(anyInput?.currency)}.`
      );
    }
    const price = String(anyInput.price).trim();
    const originalPrice =
      anyInput.originalPrice == null
        ? null
        : String(anyInput.originalPrice).trim();

    const priceMinor = toMoneyMinor(price, `${currency} price`);
    const originalPriceMinor = toMoneyMinorNullable(
      originalPrice,
      `${currency} originalPrice`,
      price
    );

    return [{ currency, priceMinor, originalPriceMinor }];
  }

  return [];
}

function requireUsd(prices: NormalizedPriceRow[]): NormalizedPriceRow {
  const usd = prices.find(p => p.currency === 'USD');
  if (!usd?.priceMinor) {
    throw new InvalidPayloadError('USD price is required.');
  }
  return usd;
}

function validatePriceRows(prices: NormalizedPriceRow[]) {
  // Safety: no duplicates even if upstream schema is bypassed
  const seen = new Set<CurrencyCode>();
  for (const p of prices) {
    if (seen.has(p.currency)) {
      throw new InvalidPayloadError('Duplicate currency in prices.');
    }
    seen.add(p.currency);

    // Runtime guard (transitional input can bypass TS/Zod)
    if (!currencyValues.includes(p.currency as any)) {
      throw new InvalidPayloadError(
        `Unsupported currency: ${String(p.currency)}.`
      );
    }

    // priceMinor must be positive integer (minor units)
    if (!Number.isSafeInteger(p.priceMinor) || p.priceMinor < 1) {
      throw new InvalidPayloadError(`${p.currency}: price is required.`);
    }

    // originalPriceMinor must be > priceMinor when present
    if (p.originalPriceMinor != null) {
      if (!Number.isSafeInteger(p.originalPriceMinor)) {
        throw new InvalidPayloadError(
          `${p.currency} originalPrice must be a number.`
        );
      }
      if (p.originalPriceMinor <= p.priceMinor) {
        throw new InvalidPayloadError(
          `${p.currency} originalPrice must be > price.`
        );
      }
    }
  }
}

export async function createProduct(input: ProductInput): Promise<DbProduct> {
  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title
  );

  let uploaded: { secureUrl: string; publicId: string } | null = null;

  try {
    uploaded = await uploadProductImageFromFile((input as any).image);
  } catch (error) {
    logError('Failed to upload product image', error);
    throw error;
  }

  const prices = normalizePricesFromInput(input);
  if (!prices.length) {
    // Hard fail: admin flow must provide prices
    throw new InvalidPayloadError('Product pricing is required.');
  }
  validatePriceRows(prices);
  const usd = requireUsd(prices);

  let createdProductId: string | null = null;

  try {
    const [row] = await db
      .insert(products)
      .values({
        slug,
        title: (input as any).title,
        description: (input as any).description ?? null,
        imageUrl: uploaded?.secureUrl ?? '',
        imagePublicId: uploaded?.publicId,

        // legacy mirror (USD) — required by products.price NOT NULL
        price: toDbMoney(usd.priceMinor),
        originalPrice:
          usd.originalPriceMinor == null
            ? null
            : toDbMoney(usd.originalPriceMinor),
        currency: 'USD',

        category: (input as any).category ?? null,
        type: (input as any).type ?? null,
        colors: (input as any).colors ?? [],
        sizes: (input as any).sizes ?? [],
        badge: (input as any).badge ?? 'NONE',
        isActive: (input as any).isActive ?? true,
        isFeatured: (input as any).isFeatured ?? false,
        stock: (input as any).stock ?? 0,
        sku: (input as any).sku ?? null,
      })
      .onConflictDoNothing({ target: products.slug })
      .returning();

    if (!row) {
      throw new SlugConflictError('Slug already exists.');
    }

    createdProductId = row.id;

    await db.insert(productPrices).values(
      prices.map(p => {
        const priceMinor = p.priceMinor;
        const originalMinor = p.originalPriceMinor;

        return {
          productId: row.id,
          currency: p.currency,

          // canonical
          priceMinor,
          originalPriceMinor: originalMinor,

          // legacy mirror
          price: toDbMoney(priceMinor),
          originalPrice:
            originalMinor == null ? null : toDbMoney(originalMinor),
        };
      })
    );

    return mapRowToProduct(row);
  } catch (error) {
    // якщо product_prices впало після створення продукту — прибираємо продукт (best-effort)
    if (createdProductId) {
      try {
        await db.delete(products).where(eq(products.id, createdProductId));
      } catch (cleanupDbError) {
        logError(
          'Failed to cleanup product after create failure',
          cleanupDbError
        );
      }
    }
    throw error;
  }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput
): Promise<DbProduct> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const slug = await normalizeSlug(
    db,
    (input as any).slug ?? (input as any).title ?? existing.slug,
    { excludeId: id }
  );

  let uploaded: { secureUrl: string; publicId: string } | null = null;

  if ((input as any).image instanceof File && (input as any).image.size > 0) {
    try {
      uploaded = await uploadProductImageFromFile((input as any).image);
    } catch (error) {
      logError('Failed to upload replacement image', error);
      throw error;
    }
  }

  const prices = normalizePricesFromInput(input);
  if (prices.length) validatePriceRows(prices);

  // Base fields update
  const updateData: Partial<ProductsTable['$inferInsert']> = {
    slug,
    title: (input as any).title ?? existing.title,
    description: (input as any).description ?? existing.description ?? null,
    imageUrl: uploaded ? uploaded.secureUrl : existing.imageUrl,
    imagePublicId: uploaded ? uploaded.publicId : existing.imagePublicId,

    category: (input as any).category ?? existing.category,
    type: (input as any).type ?? existing.type,
    colors: (input as any).colors ?? existing.colors,
    sizes: (input as any).sizes ?? existing.sizes,
    badge: (input as any).badge ?? existing.badge,
    isActive: (input as any).isActive ?? existing.isActive,
    isFeatured: (input as any).isFeatured ?? existing.isFeatured,
    stock: (input as any).stock ?? existing.stock,
    sku:
      (input as any).sku !== undefined
        ? (input as any).sku
          ? (input as any).sku
          : null
        : existing.sku,

    // legacy invariants: keep stable as USD mirror
    currency: 'USD',
    price: existing.price,
    originalPrice: existing.originalPrice,
  };

  // If USD provided in prices, update legacy mirror
  if (prices.length) {
    const usd = prices.find(p => p.currency === 'USD');
    if (usd?.priceMinor) {
      updateData.price = toDbMoney(usd.priceMinor);
      updateData.originalPrice =
        usd.originalPriceMinor == null
          ? null
          : toDbMoney(usd.originalPriceMinor);
      updateData.currency = 'USD';
    }
  }

  try {
    // 1) upsert prices (якщо прийшли)
    if (prices.length) {
      const upsertRows = prices.map(p => {
        const priceMinor = p.priceMinor;
        const originalMinor = p.originalPriceMinor;

        return {
          productId: id,
          currency: p.currency,
          priceMinor,
          originalPriceMinor: originalMinor,
          price: toDbMoney(priceMinor),
          originalPrice:
            originalMinor == null ? null : toDbMoney(originalMinor),
        };
      });

      await db
        .insert(productPrices)
        .values(upsertRows)
        .onConflictDoUpdate({
          target: [productPrices.productId, productPrices.currency],
          set: {
            priceMinor: sql`excluded.price_minor`,
            originalPriceMinor: sql`excluded.original_price_minor`,
            price: sql`excluded.price`,
            originalPrice: sql`excluded.original_price`,
            updatedAt: sql`now()`,
          },
        });
    }

    // 2) update products
    const [row] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();

    if (!row) {
      throw new Error('PRODUCT_NOT_FOUND');
    }

    // 3) якщо нову картинку застосували — видаляємо стару
    if (uploaded && existing.imagePublicId) {
      try {
        await destroyProductImage(existing.imagePublicId);
      } catch (cleanupError) {
        logError('Failed to cleanup old image after update', cleanupError);
      }
    }

    return mapRowToProduct(row);
  } catch (error) {
    // IMPORTANT: цей cleanup валідний, бо product update ще не гарантує що відбувся
    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after update failure',
          cleanupError
        );
      }
    }

    if ((error as { code?: string }).code === '23505') {
      throw new SlugConflictError('Slug already exists.');
    }
    throw error;
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  await db.delete(products).where(eq(products.id, id));

  if (existing.imagePublicId) {
    try {
      await destroyProductImage(existing.imagePublicId);
    } catch (error) {
      logError('Failed to cleanup product image after delete', error);
    }
  }
}

export async function getAdminProductById(id: string): Promise<DbProduct> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!row) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  return mapRowToProduct(row);
}

export async function getAdminProductPrices(productId: string): Promise<
  Array<{
    currency: CurrencyCode;
    priceMinor: unknown;
    originalPriceMinor: unknown;
    price: unknown;
    originalPrice: unknown;
  }>
> {
  return db
    .select({
      currency: productPrices.currency,
      // canonical:
      priceMinor: productPrices.priceMinor,
      originalPriceMinor: productPrices.originalPriceMinor,
      // legacy (keep during rollout):
      price: productPrices.price,
      originalPrice: productPrices.originalPrice,
    })
    .from(productPrices)
    .where(eq(productPrices.productId, productId));
}

export async function getAdminProductByIdWithPrices(id: string): Promise<
  DbProduct & {
    prices: Array<{
      currency: CurrencyCode;
      priceMinor: unknown;
      originalPriceMinor: unknown;
      price: unknown;
      originalPrice: unknown;
    }>;
  }
> {
  const product = await getAdminProductById(id);
  const prices = await getAdminProductPrices(id);
  return { ...product, prices };
}

export async function getAdminProductsList(
  filters: AdminProductsFilter = {}
): Promise<DbProduct[]> {
  const conditions: SQL[] = [];

  if (typeof filters.isActive === 'boolean') {
    conditions.push(eq(products.isActive, filters.isActive));
  }
  if (filters.category) {
    conditions.push(eq(products.category, filters.category));
  }
  if (filters.type) {
    conditions.push(eq(products.type, filters.type));
  }

  const rows = await db
    .select()
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined);

  return rows.map(mapRowToProduct);
}

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

    // критично: ціна має бути з product_prices для поточної currency
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

export async function toggleProductStatus(id: string): Promise<DbProduct> {
  const [current] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!current) {
    throw new Error('PRODUCT_NOT_FOUND');
  }

  const [updated] = await db
    .update(products)
    .set({ isActive: !current.isActive })
    .where(eq(products.id, id))
    .returning();

  return mapRowToProduct(updated);
}
