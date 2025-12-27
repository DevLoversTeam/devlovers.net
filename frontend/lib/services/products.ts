import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';

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

type PriceRowInput = {
  currency: CurrencyCode;
  price: string;
  originalPrice?: string | null;
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

function toMoneyDb(value: string, field: string): string {
  const cents = toMoneyMinor(value, field);
  return toDbMoney(cents);
}

function toMoneyDbNullable(
  value: string | null | undefined,
  field: string,
  price: string
): string | null {
  const cents = toMoneyMinorNullable(value, field, price);
  if (cents == null) return null;
  return toDbMoney(cents);
}

function normalizePricesFromInput(input: unknown): PriceRowInput[] {
  // Transitional-safe: supports both new input.prices[] and legacy input.price/originalPrice/currency.
  const anyInput = input as any;

  const prices = anyInput?.prices;
  if (Array.isArray(prices) && prices.length) {
    return prices as PriceRowInput[];
  }

  // Legacy fallback (only if present)
  if (anyInput?.price != null) {
    const currency = (anyInput?.currency as CurrencyCode) ?? 'USD';
    const price = String(anyInput.price);
    const originalPrice =
      anyInput.originalPrice == null ? null : String(anyInput.originalPrice);

    return [{ currency, price, originalPrice }];
  }

  return [];
}

function requireUsd(prices: PriceRowInput[]): PriceRowInput {
  const usd = prices.find(p => p.currency === 'USD');
  if (!usd?.price) {
    throw new InvalidPayloadError('USD price is required.');
  }
  return usd;
}

function validatePriceRows(prices: PriceRowInput[]) {
  for (const p of prices) {
    // Runtime guard (legacy/transitional input can bypass TS/Zod)
    if (!currencyValues.includes((p as any).currency)) {
      throw new InvalidPayloadError(
        `Unsupported currency: ${String((p as any).currency)}.`
      );
    }
    // If original is provided, price must be provided too.
    if ((p.originalPrice ?? null) !== null && !p.price?.trim()) {
      throw new InvalidPayloadError(
        `${p.currency}: price is required when originalPrice is provided.`
      );
    }
    if (!p.price?.trim()) {
      throw new InvalidPayloadError(`${p.currency}: price is required.`);
    }
    // Validate numeric + invariants
    assertMoneyString(p.price, `${p.currency} price`);
    assertOptionalMoneyString(
      p.originalPrice ?? null,
      `${p.currency} originalPrice`,
      p.price
    );
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

  try {
    const [created] = await db.transaction(async tx => {
      const [row] = await tx
        .insert(products)
        .values({
          slug,
          title: (input as any).title,
          description: (input as any).description ?? null,
          imageUrl: uploaded?.secureUrl ?? '',
          imagePublicId: uploaded?.publicId,

          // legacy mirror (USD) — required by products.price NOT NULL
          price: toMoneyDb(usd.price, 'USD price'),
          originalPrice: toMoneyDbNullable(
            usd.originalPrice ?? null,
            'USD originalPrice',
            usd.price
          ),
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

      await tx.insert(productPrices).values(
        prices.map(p => {
          const priceMinor = toMoneyMinor(p.price, `${p.currency} price`);
          const originalMinor = toMoneyMinorNullable(
            p.originalPrice ?? null,
            `${p.currency} originalPrice`,
            p.price
          );

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

      return [row];
    });

    return mapRowToProduct(created);
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await destroyProductImage(uploaded.publicId);
      } catch (cleanupError) {
        logError(
          'Failed to cleanup uploaded image after create failure',
          cleanupError
        );
      }
    }
    if (error instanceof SlugConflictError) throw error;
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
    if (usd?.price) {
      updateData.price = toMoneyDb(usd.price, 'USD price');
      updateData.originalPrice = toMoneyDbNullable(
        usd.originalPrice ?? null,
        'USD originalPrice',
        usd.price
      );
      updateData.currency = 'USD';
    }
  }

  try {
    const [updated] = await db.transaction(async tx => {
      const [row] = await tx
        .update(products)
        .set(updateData)
        .where(eq(products.id, id))
        .returning();

      if (!row) {
        throw new Error('PRODUCT_NOT_FOUND');
      }

      // Upsert prices (only currencies provided in this request)
      if (prices.length) {
        for (const p of prices) {
          const priceMinor = toMoneyMinor(p.price, `${p.currency} price`);
          const originalMinor = toMoneyMinorNullable(
            p.originalPrice ?? null,
            `${p.currency} originalPrice`,
            p.price
          );

          const priceDb = toDbMoney(priceMinor);
          const originalDb =
            originalMinor == null ? null : toDbMoney(originalMinor);

          const updatedPrice = await tx
            .update(productPrices)
            .set({
              priceMinor,
              originalPriceMinor: originalMinor,
              price: priceDb,
              originalPrice: originalDb,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(productPrices.productId, id),
                eq(productPrices.currency, p.currency)
              )
            )
            .returning({ id: productPrices.id });

          if (!updatedPrice.length) {
            await tx.insert(productPrices).values({
              productId: id,
              currency: p.currency,
              price: priceDb,
              originalPrice: originalDb,
              priceMinor,
              originalPriceMinor: originalMinor,
            });
          }
        }
      }

      return [row];
    });

    if (uploaded && existing.imagePublicId) {
      try {
        await destroyProductImage(existing.imagePublicId);
      } catch (cleanupError) {
        logError('Failed to cleanup old image after update', cleanupError);
      }
    }

    return mapRowToProduct(updated);
  } catch (error) {
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
    price: unknown;
    originalPrice: unknown;
  }>
> {
  return db
    .select({
      currency: productPrices.currency,
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
      summary: { totalAmount: 0, itemCount: 0, currency },
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
    if (!product.priceCurrency || product.price == null) {
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

    const unitPriceCents =
      typeof (product as any).priceMinor === 'number' &&
      Number.isFinite((product as any).priceMinor)
        ? Math.trunc((product as any).priceMinor)
        : toCents(
            coercePriceFromDb(product.price, {
              field: 'price',
              productId: product.id,
            })
          );

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

      // IMPORTANT: MINOR units (integer)
      unitPrice: unitPriceCents,
      lineTotal: lineTotalCents,

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
    summary: { totalAmount: totalCents, itemCount, currency },
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
