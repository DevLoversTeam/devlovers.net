import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from '@/db/schema/users';
import type { PaymentProvider, PaymentStatus } from '@/lib/shop/payments';

export const productBadgeEnum = pgEnum('product_badge', [
  'NEW',
  'SALE',
  'NONE',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'requires_payment',
  'paid',
  'failed',
  'refunded',
]);
export const currencyEnum = pgEnum('currency', ['USD', 'UAH']);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    imageUrl: text('image_url').notNull(),
    imagePublicId: text('image_public_id'),
    // legacy mirror (USD) — keep for now
    price: numeric('price', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),
    originalPrice: numeric('original_price', {
      precision: 10,
      scale: 2,
    }).$type<string>(),
    currency: currencyEnum('currency').notNull().default('USD'),
    category: text('category'),
    type: text('type'),
    colors: text('colors')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sizes: text('sizes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    badge: productBadgeEnum('badge').notNull().default('NONE'),
    isActive: boolean('is_active').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    stock: integer('stock').notNull().default(0),
    sku: text('sku'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('products_slug_unique').on(table.slug),
    check('products_stock_non_negative', sql`${table.stock} >= 0`),
    check('products_currency_usd_only', sql`${table.currency} = 'USD'`),
    check('products_price_positive', sql`${table.price} > 0`),
    check(
      'products_original_price_valid',
      sql`${table.originalPrice} is null or ${table.originalPrice} > ${table.price}`
    ),
  ]
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    // canonical money (minor units)
    totalAmountMinor: integer('total_amount_minor').notNull(),

    // legacy mirror for UI/back-compat
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),

    currency: currencyEnum('currency').notNull().default('USD'),
    // keep as enum in DB and in TS
    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('pending')
      .$type<PaymentStatus>(),

    // provider is text + CHECK constraint (OK), but TS must be narrowed
    paymentProvider: text('payment_provider')
      .notNull()
      .default('stripe')
      .$type<PaymentProvider>(),
    paymentIntentId: text('payment_intent_id'),
    pspChargeId: text('psp_charge_id'),
    pspPaymentMethod: text('psp_payment_method'),
    pspStatusReason: text('psp_status_reason'),
    pspMetadata: jsonb('psp_metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    stockRestored: boolean('stock_restored').notNull().default(false),
    restockedAt: timestamp('restocked_at', { mode: 'date' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 })
      .notNull()
      .unique(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  table => [
    check(
      'orders_payment_provider_valid',
      sql`${table.paymentProvider} in ('stripe', 'none')`
    ),
    check(
      'orders_total_amount_minor_non_negative',
      sql`${table.totalAmountMinor} >= 0`
    ),
    check(
      'orders_payment_intent_id_null_when_none',
      sql`${table.paymentProvider} <> 'none' OR ${table.paymentIntentId} IS NULL`
    ),
    check(
      'orders_total_amount_mirror_consistent',
      sql`${table.totalAmount} = (${table.totalAmountMinor}::numeric / 100)`
    ),
    check(
      'orders_payment_status_paid_when_none',
      sql`${table.paymentProvider} <> 'none' OR ${table.paymentStatus} = 'paid'`
    ),
  ]
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),

    unitPriceMinor: integer('unit_price_minor').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),

    unitPrice: numeric('unit_price', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),
    lineTotal: numeric('line_total', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),

    productTitle: text('product_title'),
    productSlug: text('product_slug'),
    productSku: text('product_sku'),
  },
  t => [
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'order_items_unit_price_minor_non_negative',
      sql`${t.unitPriceMinor} >= 0`
    ),
    check(
      'order_items_line_total_minor_non_negative',
      sql`${t.lineTotalMinor} >= 0`
    ),
    check(
      'order_items_line_total_consistent',
      sql`${t.lineTotalMinor} = ${t.unitPriceMinor} * ${t.quantity}`
    ),
    check(
      'order_items_unit_price_mirror_consistent',
      sql`${t.unitPrice} = (${t.unitPriceMinor}::numeric / 100)`
    ),
    check(
      'order_items_line_total_mirror_consistent',
      sql`${t.lineTotal} = (${t.lineTotalMinor}::numeric / 100)`
    ),
  ]
);

export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('stripe'),
    eventId: text('event_id').notNull(),
    paymentIntentId: text('payment_intent_id'),
    orderId: uuid('order_id').references(() => orders.id),
    eventType: text('event_type').notNull(),
    paymentStatus: text('payment_status'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [uniqueIndex('stripe_events_event_id_idx').on(table.eventId)]
);

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    currency: currencyEnum('currency').notNull(),

    // canonical money (minor units)
    priceMinor: integer('price_minor').notNull(),
    originalPriceMinor: integer('original_price_minor'),

    // legacy mirror (keep for now; used by admin/UI)
    price: numeric('price', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),
    originalPrice: numeric('original_price', {
      precision: 10,
      scale: 2,
    }).$type<string>(),

    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('product_prices_product_currency_uq').on(
      t.productId,
      t.currency
    ),

    // checks should enforce canonical fields
    check('product_prices_price_positive', sql`${t.priceMinor} > 0`),
    check(
      'product_prices_original_price_valid',
      sql`${t.originalPriceMinor} is null or ${t.originalPriceMinor} > ${t.priceMinor}`
    ),
    check(
      'product_prices_price_mirror_consistent',
      sql`${t.price} = (${t.priceMinor}::numeric / 100)`
    ),
    check(
      'product_prices_original_price_null_coupled',
      sql`(${t.originalPriceMinor} is null) = (${t.originalPrice} is null)`
    ),
    check(
      'product_prices_original_price_mirror_consistent',
      sql`${t.originalPriceMinor} is null or ${t.originalPrice} = (${t.originalPriceMinor}::numeric / 100)`
    ),
  ]
);

export type DbProductPrice = typeof productPrices.$inferSelect;
export type DbOrder = typeof orders.$inferSelect;
export type DbOrderItem = typeof orderItems.$inferSelect;
