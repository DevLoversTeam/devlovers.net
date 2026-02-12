import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
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
  'needs_review',
]);
export const currencyEnum = pgEnum('currency', ['USD', 'UAH']);

export const orderStatusEnum = pgEnum('order_status', [
  'CREATED',
  'INVENTORY_RESERVED',
  'INVENTORY_FAILED',
  'PAID',
  'CANCELED',
]);

export const inventoryStatusEnum = pgEnum('inventory_status', [
  'none',
  'reserving',
  'reserved',
  'release_pending',
  'released',
  'failed',
]);

export const inventoryMoveTypeEnum = pgEnum('inventory_move_type', [
  'reserve',
  'release',
]);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    imageUrl: text('image_url').notNull(),
    imagePublicId: text('image_public_id'),
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

    totalAmountMinor: integer('total_amount_minor').notNull(),

    totalAmount: numeric('total_amount', { precision: 10, scale: 2 })
      .$type<string>()
      .notNull(),

    currency: currencyEnum('currency').notNull().default('USD'),

    paymentStatus: paymentStatusEnum('payment_status')
      .notNull()
      .default('pending')
      .$type<PaymentStatus>(),

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

    status: orderStatusEnum('status').notNull().default('CREATED'),
    inventoryStatus: inventoryStatusEnum('inventory_status')
      .notNull()
      .default('none'),
    failureCode: text('failure_code'),
    failureMessage: text('failure_message'),
    idempotencyRequestHash: text('idempotency_request_hash'),

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
    sweepClaimedAt: timestamp('sweep_claimed_at'),
    sweepClaimExpiresAt: timestamp('sweep_claim_expires_at'),
    sweepRunId: uuid('sweep_run_id'),
    sweepClaimedBy: varchar('sweep_claimed_by', { length: 64 }),
  },
  table => [
    check(
      'orders_payment_provider_valid',
      sql`${table.paymentProvider} in ('stripe', 'monobank', 'none')`
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
      'orders_psp_fields_null_when_none',
      sql`${table.paymentProvider} <> 'none' OR (
        ${table.pspChargeId} IS NULL AND
        ${table.pspPaymentMethod} IS NULL AND
        ${table.pspStatusReason} IS NULL
      )`
    ),
    check(
      'orders_total_amount_mirror_consistent',
      sql`${table.totalAmount} = (${table.totalAmountMinor}::numeric / 100)`
    ),
    check(
      'orders_payment_status_valid_when_none',
      sql`${table.paymentProvider} <> 'none' OR ${table.paymentStatus} in ('paid','failed')`
    ),
    index('orders_sweep_claim_expires_idx').on(table.sweepClaimExpiresAt),
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

    selectedSize: text('selected_size').notNull().default(''),
    selectedColor: text('selected_color').notNull().default(''),
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
    index('order_items_order_id_idx').on(t.orderId),
    uniqueIndex('order_items_order_variant_uq').on(
      t.orderId,
      t.productId,
      t.selectedSize,
      t.selectedColor
    ),
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
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'cascade',
    }),
    eventType: text('event_type').notNull(),
    paymentStatus: text('payment_status'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    claimedBy: varchar('claimed_by', { length: 64 }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('stripe_events_event_id_idx').on(table.eventId),
    index('stripe_events_claim_expires_idx').on(table.claimExpiresAt),
  ]
);

export const monobankEvents = pgTable(
  'monobank_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('monobank'),
    eventKey: text('event_key').notNull(),
    invoiceId: text('invoice_id'),
    status: text('status'),
    amount: integer('amount'),
    ccy: integer('ccy'),
    reference: text('reference'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown> | null>(),
    normalizedPayload: jsonb('normalized_payload').$type<Record<
      string,
      unknown
    > | null>(),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id, {
      onDelete: 'set null',
    }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'cascade',
    }),
    providerModifiedAt: timestamp('provider_modified_at', {
      withTimezone: true,
    }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    appliedResult: text('applied_result'),
    appliedErrorCode: text('applied_error_code'),
    appliedErrorMessage: text('applied_error_message'),
    rawSha256: text('raw_sha256').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    check('monobank_events_provider_check', sql`${t.provider} in ('monobank')`),
    uniqueIndex('monobank_events_event_key_unique').on(t.eventKey),
    uniqueIndex('monobank_events_raw_sha256_unique').on(t.rawSha256),
    index('monobank_events_order_id_idx').on(t.orderId),
    index('monobank_events_attempt_id_idx').on(t.attemptId),
    index('monobank_events_claim_expires_idx').on(t.claimExpiresAt),
  ]
);

export const monobankRefunds = pgTable(
  'monobank_refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    provider: text('provider').notNull().default('monobank'),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id, {
      onDelete: 'set null',
    }),
    extRef: text('ext_ref').notNull(),
    status: text('status').notNull().default('requested'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: currencyEnum('currency').notNull().default('UAH'),
    providerCreatedAt: timestamp('provider_created_at', {
      withTimezone: true,
    }),
    providerModifiedAt: timestamp('provider_modified_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    check(
      'monobank_refunds_provider_check',
      sql`${t.provider} in ('monobank')`
    ),
    check(
      'monobank_refunds_status_check',
      sql`${t.status} in ('requested','processing','success','failure','needs_review')`
    ),
    check(
      'monobank_refunds_amount_minor_non_negative',
      sql`${t.amountMinor} >= 0`
    ),
    check('monobank_refunds_currency_uah', sql`${t.currency} = 'UAH'`),
    uniqueIndex('monobank_refunds_ext_ref_unique').on(t.extRef),
    index('monobank_refunds_order_id_idx').on(t.orderId),
    index('monobank_refunds_attempt_id_idx').on(t.attemptId),
  ]
);

export const monobankPaymentCancels = pgTable(
  'monobank_payment_cancels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    extRef: text('ext_ref').notNull(),
    invoiceId: text('invoice_id').notNull(),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id, {
      onDelete: 'set null',
    }),
    status: text('status').notNull().default('requested'),
    requestId: text('request_id').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    pspResponse: jsonb('psp_response').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    check(
      'monobank_payment_cancels_status_check',
      sql`${t.status} in ('requested','processing','success','failure')`
    ),
    uniqueIndex('monobank_payment_cancels_ext_ref_unique').on(t.extRef),
    index('monobank_payment_cancels_order_id_idx').on(t.orderId),
    index('monobank_payment_cancels_attempt_id_idx').on(t.attemptId),
  ]
);

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    currency: currencyEnum('currency').notNull(),

    priceMinor: integer('price_minor').notNull(),
    originalPriceMinor: integer('original_price_minor'),

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
    index('product_prices_product_id_idx').on(t.productId),
    uniqueIndex('product_prices_product_currency_uq').on(
      t.productId,
      t.currency
    ),

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

export const inventoryMoves = pgTable(
  'inventory_moves',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    moveKey: varchar('move_key', { length: 200 }).notNull(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),

    type: inventoryMoveTypeEnum('type').notNull(),

    quantity: integer('quantity').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('inventory_moves_move_key_uq').on(t.moveKey),
    index('inventory_moves_order_id_idx').on(t.orderId),
    index('inventory_moves_product_id_idx').on(t.productId),
    check('inventory_moves_quantity_gt_0', sql`${t.quantity} > 0`),
  ]
);

export const internalJobState = pgTable('internal_job_state', {
  jobName: text('job_name').primaryKey(),
  nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }).notNull(),
  lastRunId: uuid('last_run_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    key: text('key').primaryKey(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
    }).notNull(),
    count: integer('count').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    check('api_rate_limits_count_non_negative', sql`${t.count} >= 0`),
    index('api_rate_limits_updated_at_idx').on(t.updatedAt),
  ]
);

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    provider: text('provider').notNull(),
    status: text('status').notNull().default('active'),
    attemptNumber: integer('attempt_number').notNull(),
    currency: currencyEnum('currency'),
    expectedAmountMinor: bigint('expected_amount_minor', { mode: 'number' }),

    idempotencyKey: text('idempotency_key').notNull(),
    providerPaymentIntentId: text('provider_payment_intent_id'),
    checkoutUrl: text('checkout_url'),
    providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }),
    providerModifiedAt: timestamp('provider_modified_at', {
      withTimezone: true,
    }),

    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),

    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  },
  t => [
    check(
      'payment_attempts_provider_check',
      sql`${t.provider} in ('stripe','monobank')`
    ),

    check(
      'payment_attempts_status_check',
      sql`${t.status} in ('creating','active','succeeded','failed','canceled')`
    ),

    check(
      'payment_attempts_attempt_number_check',
      sql`${t.attemptNumber} >= 1`
    ),
    check(
      'payment_attempts_expected_amount_minor_non_negative',
      sql`${t.expectedAmountMinor} is null or ${t.expectedAmountMinor} >= 0`
    ),
    check(
      'payment_attempts_mono_currency_uah',
      sql`${t.provider} <> 'monobank' OR ${t.currency} = 'UAH'`
    ),

    uniqueIndex('payment_attempts_order_provider_attempt_unique').on(
      t.orderId,
      t.provider,
      t.attemptNumber
    ),
    uniqueIndex('payment_attempts_idempotency_key_unique').on(t.idempotencyKey),
    uniqueIndex('payment_attempts_provider_pi_unique').on(
      t.providerPaymentIntentId
    ),
    index('payment_attempts_order_provider_status_idx').on(
      t.orderId,
      t.provider,
      t.status
    ),

    uniqueIndex('payment_attempts_order_provider_active_unique')
      .on(t.orderId, t.provider)
      .where(sql`${t.status} in ('active','creating')`),
    index('payment_attempts_provider_status_updated_idx').on(
      t.provider,
      t.status,
      t.updatedAt
    ),
  ]
);

export type DbProductPrice = typeof productPrices.$inferSelect;
export type DbOrder = typeof orders.$inferSelect;
export type DbOrderItem = typeof orderItems.$inferSelect;
export type DbInventoryMove = typeof inventoryMoves.$inferSelect;
export type DbInternalJobState = typeof internalJobState.$inferSelect;
export type DbPaymentAttempt = typeof paymentAttempts.$inferSelect;
export type DbApiRateLimit = typeof apiRateLimits.$inferSelect;
export type DbMonobankEvent = typeof monobankEvents.$inferSelect;
export type DbMonobankRefund = typeof monobankRefunds.$inferSelect;
export type DbMonobankPaymentCancel = typeof monobankPaymentCancels.$inferSelect;
