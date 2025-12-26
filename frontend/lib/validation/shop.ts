import { z } from 'zod';
import {
  CATALOG_PAGE_SIZE,
  CATEGORIES,
  COLORS,
  PRODUCT_TYPES,
  SIZES,
  SORT_OPTIONS,
} from '@/lib/config/catalog';
import { currencyValues } from '@/lib/shop/currency';
import {
  paymentProviderValues,
  paymentStatusValues,
} from '@/lib/shop/payments';
export type { PaymentStatus, PaymentProvider } from '@/lib/shop/payments';

export const MAX_QUANTITY_PER_LINE = 20;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export const productBadgeValues = ['NEW', 'SALE', 'NONE'] as const;
export type ProductBadge = (typeof productBadgeValues)[number];

const sortValues: SortValue[] = SORT_OPTIONS.map(o => o.value);
const sortEnum = z.enum(sortValues as [SortValue, ...SortValue[]]);

export const badgeSchema = z.enum(productBadgeValues);
export const paymentStatusSchema = z.enum(paymentStatusValues);
export const paymentProviderSchema = z.enum(paymentProviderValues);
export const currencySchema = z.enum(currencyValues);

export type { CurrencyCode } from '@/lib/shop/currency';

const searchParamString = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform(value => {
    if (Array.isArray(value)) return value[0]?.trim() ?? undefined;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }
    return undefined;
  });

const categoryValues = CATEGORIES.map(c => c.slug);
const productCategoryValues = categoryValues.filter(slug => slug !== 'all');
const typeValues = PRODUCT_TYPES.map(t => t.slug);
const colorValues = COLORS.map(c => c.slug);
const sizeValues = SIZES.map(s => s);

const enumSearchParam = <T extends readonly [string, ...string[]]>(values: T) =>
  searchParamString.pipe(z.enum(values).optional());

const categoryParam = enumSearchParam(
  categoryValues as [string, ...string[]]
).transform(value => (value === 'all' ? undefined : value));
const typeParam = enumSearchParam(typeValues as [string, ...string[]]);
const colorParam = enumSearchParam(colorValues as [string, ...string[]]);
const sizeParam = enumSearchParam(sizeValues as [string, ...string[]]);

export const catalogQuerySchema = z
  .object({
    category: categoryParam,
    type: typeParam,
    color: colorParam,
    size: sizeParam,
    sort: enumSearchParam(sortValues as [SortValue, ...SortValue[]]),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(CATALOG_PAGE_SIZE),
  })
  .strict();

export const catalogFilterSchema = z
  .object({
    category: z
      .enum(categoryValues as [string, ...string[]])
      .optional()
      .transform(value => (value === 'all' ? undefined : value)),
    type: z.enum(typeValues as [string, ...string[]]).optional(),
    color: z.enum(colorValues as [string, ...string[]]).optional(),
    size: z.enum(sizeValues as [string, ...string[]]).optional(),
    sort: sortEnum.optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(CATALOG_PAGE_SIZE),
  })
  .strict();

export const dbProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z
    .string()
    .nullish()
    .transform(value => value ?? undefined),
  imageUrl: z.string(),
  imagePublicId: z
    .string()
    .nullish()
    .transform(value => value ?? undefined),
  price: z.coerce.number(),
  originalPrice: z.coerce
    .number()
    .nullish()
    .transform(value => (value == null ? undefined : value)),
  currency: currencySchema,
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  stock: z.coerce.number().int().min(0),
  sku: z
    .string()
    .nullish()
    .transform(value => value ?? undefined),
  category: z
    .enum(productCategoryValues as [string, ...string[]])
    .nullish()
    .transform(value => value ?? undefined),
  type: z
    .enum(typeValues as [string, ...string[]])
    .nullish()
    .transform(value => value ?? undefined),
  colors: z
    .array(z.enum(colorValues as [string, ...string[]]))
    .nullish()
    .transform(value => value ?? []),
  sizes: z
    .array(z.enum(sizeValues as [string, ...string[]]))
    .nullish()
    .transform(value => value ?? []),
  badge: badgeSchema
    .nullish()
    .transform(value => (value ?? 'NONE') as ProductBadge),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const shopProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  price: z.number(),
  currency: currencySchema,
  image: z.string(),
  originalPrice: z.number().optional(),
  createdAt: z.date().optional(),
  category: z.enum(productCategoryValues as [string, ...string[]]).optional(),
  type: z.enum(typeValues as [string, ...string[]]).optional(),
  colors: z.array(z.enum(colorValues as [string, ...string[]])).default([]),
  sizes: z.array(z.enum(sizeValues as [string, ...string[]])).default([]),
  description: z.string().optional(),
  badge: badgeSchema.optional(),
  inStock: z.boolean(),
});

const booleanFromString = z.preprocess(value => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
}, z.boolean().optional());

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Invalid money format');

export const adminPriceRowSchema = z
  .object({
    currency: currencySchema,
    price: moneyString,
    originalPrice: moneyString.optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const price = Number(v.price);
    if (!Number.isFinite(price) || price <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'Price must be > 0',
      });
    }

    if (v.originalPrice != null) {
      const original = Number(v.originalPrice);
      if (!Number.isFinite(original) || original <= price) {
        ctx.addIssue({
          code: 'custom',
          path: ['originalPrice'],
          message: 'Original price must be > price',
        });
      }
    }
  });

export const productAdminSchema = z
  .object({
    title: z.string().min(1),
    slug: z
      .string()
      .optional()
      .transform(value => {
        const trimmed = value?.trim() ?? '';
        return trimmed.length ? trimmed : undefined;
      }),
    prices: z.array(adminPriceRowSchema).min(1),
    description: z.string().optional(),
    category: z.enum(productCategoryValues as [string, ...string[]]).optional(),
    type: z.enum(typeValues as [string, ...string[]]).optional(),
    colors: z.array(z.enum(colorValues as [string, ...string[]])).default([]),
    sizes: z.array(z.enum(sizeValues as [string, ...string[]])).default([]),
    stock: z.coerce.number().int().min(0).default(0),
    sku: z.string().optional(),
    badge: badgeSchema.default('NONE'),
    isActive: booleanFromString.default(true),
    isFeatured: booleanFromString.default(false),
  })
  .superRefine((data, ctx) => {
    // 1) no duplicate currencies
    const seen = new Set<string>();
    data.prices.forEach((p, idx) => {
      if (seen.has(p.currency)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prices', idx, 'currency'],
          message: 'Duplicate currency in prices',
        });
      } else {
        seen.add(p.currency);
      }
    });

    const usd = data.prices.find(p => p.currency === 'USD');
    if (!usd?.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prices'],
        message: 'USD price is required',
      });
    }
  });

// 2) USD is required

export const productAdminUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    slug: z
      .string()
      .optional()
      .transform(value => {
        const trimmed = value?.trim() ?? '';
        return trimmed.length ? trimmed : undefined;
      }),
    prices: z.array(adminPriceRowSchema).optional(),
    description: z.string().optional(),
    category: z.enum(productCategoryValues as [string, ...string[]]).optional(),
    type: z.enum(typeValues as [string, ...string[]]).optional(),
    colors: z.array(z.enum(colorValues as [string, ...string[]])).optional(),
    sizes: z.array(z.enum(sizeValues as [string, ...string[]])).optional(),
    stock: z.coerce.number().int().min(0).optional(),
    sku: z.string().optional(),
    badge: badgeSchema.optional(),
    isActive: booleanFromString.optional(),
    isFeatured: booleanFromString.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.prices) {
      // no duplicate currencies
      const seen = new Set<string>();
      data.prices.forEach((p, idx) => {
        if (seen.has(p.currency)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['prices', idx, 'currency'],
            message: 'Duplicate currency in prices',
          });
        } else {
          seen.add(p.currency);
        }
      });

      const usd = data.prices.find(p => p.currency === 'USD');
      if (!usd?.price) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['prices'],
          message: 'USD price is required',
        });
      }
    }
  });

export const checkoutItemSchema = z
  .object({
    productId: z.string().uuid(),
    quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
    selectedSize: z.string().optional(),
    selectedColor: z.string().optional(),
  })
  .strict();

export const checkoutPayloadSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1),
    userId: z.string().uuid().optional(),
  })
  .strict();

export const cartRehydratePayloadSchema = z
  .object({
    currency: currencySchema.optional(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
            selectedSize: z.string().optional(),
            selectedColor: z.string().optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_.-]+$/);

export const cartClientItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
  selectedSize: z.string().optional(),
  selectedColor: z.string().optional(),
});

export const cartRehydratedItemSchema = z.object({
  productId: z.string(),
  slug: z.string(),
  title: z.string(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
  unitPrice: z.number(),
  lineTotal: z.number(),
  currency: currencySchema,
  stock: z.number().int().min(0),
  badge: badgeSchema.or(z.literal('NONE')),
  imageUrl: z.string(),
  selectedSize: z.string().optional(),
  selectedColor: z.string().optional(),
});

export const cartRemovedItemSchema = z.object({
  productId: z.string(),
  reason: z.enum(['not_found', 'inactive', 'out_of_stock']),
});

export const cartRehydrateResultSchema = z.object({
  items: z.array(cartRehydratedItemSchema),
  removed: z.array(cartRemovedItemSchema),
  summary: z.object({
    totalAmount: z.number(),
    itemCount: z.number().int().min(0),
    currency: currencySchema,
  }),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const orderSummarySchema = z.object({
  id: z.string(),
  totalAmount: z.coerce.number(),
  currency: currencySchema,
  paymentStatus: paymentStatusSchema,
  paymentProvider: paymentProviderSchema,
  paymentIntentId: z
    .string()
    .nullish()
    .transform(value => value ?? undefined),
  createdAt: z.date(),
  items: z.array(
    z.object({
      productId: z.string(),
      productTitle: z.string(),
      productSlug: z.string(),
      quantity: z.number(),
      unitPrice: z.coerce.number(),
      lineTotal: z.coerce.number(),
    })
  ),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type CatalogFilters = z.infer<typeof catalogFilterSchema>;
export type DbProduct = z.infer<typeof dbProductSchema>;
export type ShopProduct = z.infer<typeof shopProductSchema>;
export type OrderSummary = z.infer<typeof orderSummarySchema>;
export type ProductAdminInput = z.infer<typeof productAdminSchema>;
export type ProductAdminUpdateInput = z.infer<typeof productAdminUpdateSchema>;
export type CartClientItem = z.infer<typeof cartClientItemSchema>;
export type CartRehydrateItem = z.infer<typeof cartRehydratedItemSchema>;
export type CartRemovedItem = z.infer<typeof cartRemovedItemSchema>;
export type CartRehydrateResult = z.infer<typeof cartRehydrateResultSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
export type CheckoutPayload = z.infer<typeof checkoutPayloadSchema>;
export type OrderIdParams = z.infer<typeof orderIdParamSchema>;
