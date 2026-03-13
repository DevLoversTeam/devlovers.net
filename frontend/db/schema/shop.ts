import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
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

export const fulfillmentModeEnum = pgEnum('fulfillment_mode', [
  'ua_np',
  'intl',
]);

export const quoteStatusEnum = pgEnum('quote_status', [
  'none',
  'requested',
  'offered',
  'accepted',
  'declined',
  'expired',
  'requires_requote',
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

export const shippingPayerEnum = pgEnum('shipping_payer', [
  'customer',
  'merchant',
]);

export const shippingProviderEnum = pgEnum('shipping_provider', [
  'nova_poshta',
  'ukrposhta',
]);

export const shippingMethodCodeEnum = pgEnum('shipping_method_code', [
  'NP_WAREHOUSE',
  'NP_LOCKER',
  'NP_COURIER',
]);

export const shippingStatusEnum = pgEnum('shipping_status', [
  'pending',
  'queued',
  'creating_label',
  'label_created',
  'shipped',
  'delivered',
  'cancelled',
  'needs_attention',
]);

export const shippingShipmentStatusEnum = pgEnum('shipping_shipment_status', [
  'queued',
  'processing',
  'succeeded',
  'failed',
  'needs_attention',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
]);

export const returnRequestStatusEnum = pgEnum('return_request_status', [
  'requested',
  'approved',
  'rejected',
  'received',
  'refunded',
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
    fulfillmentMode: fulfillmentModeEnum('fulfillment_mode')
      .notNull()
      .default('ua_np'),
    quoteStatus: quoteStatusEnum('quote_status').notNull().default('none'),
    quoteVersion: integer('quote_version'),
    shippingQuoteMinor: bigint('shipping_quote_minor', { mode: 'number' }),
    itemsSubtotalMinor: bigint('items_subtotal_minor', { mode: 'number' })
      .notNull()
      .default(0),
    quoteAcceptedAt: timestamp('quote_accepted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    quotePaymentDeadlineAt: timestamp('quote_payment_deadline_at', {
      withTimezone: true,
      mode: 'date',
    }),

    shippingRequired: boolean('shipping_required'),
    shippingPayer: shippingPayerEnum('shipping_payer'),
    shippingProvider: shippingProviderEnum('shipping_provider'),
    shippingMethodCode: shippingMethodCodeEnum('shipping_method_code'),
    shippingAmountMinor: integer('shipping_amount_minor'),
    shippingStatus: shippingStatusEnum('shipping_status'),
    trackingNumber: text('tracking_number'),
    shippingProviderRef: text('shipping_provider_ref'),

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
      'orders_items_subtotal_minor_non_negative',
      sql`${table.itemsSubtotalMinor} >= 0`
    ),
    check(
      'orders_shipping_quote_minor_non_negative',
      sql`${table.shippingQuoteMinor} is null or ${table.shippingQuoteMinor} >= 0`
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
    check(
      'orders_shipping_null_when_not_required_chk',
      sql`
    ${table.shippingRequired} IS TRUE
    OR (
      ${table.shippingProvider} IS NULL
      AND ${table.shippingMethodCode} IS NULL
      AND ${table.shippingStatus} IS NULL
    )
  `
    ),
    check(
      'orders_shipping_present_when_required_chk',
      sql`
    ${table.shippingRequired} IS DISTINCT FROM TRUE
    OR (
      ${table.shippingProvider} IS NOT NULL
      AND ${table.shippingMethodCode} IS NOT NULL
      AND ${table.shippingStatus} IS NOT NULL
    )
  `
    ),
    check(
      'orders_shipping_amount_minor_non_negative_chk',
      sql`${table.shippingAmountMinor} IS NULL OR ${table.shippingAmountMinor} >= 0`
    ),
    check(
      'orders_shipping_payer_null_when_not_required_chk',
      sql`${table.shippingRequired} IS TRUE OR ${table.shippingPayer} IS NULL`
    ),
    check(
      'orders_shipping_payer_present_when_required_chk',
      sql`${table.shippingRequired} IS DISTINCT FROM TRUE OR ${table.shippingPayer} IS NOT NULL`
    ),
    check(
      'orders_intl_provider_restriction_chk',
      sql`${table.fulfillmentMode} <> 'intl' OR ${table.paymentProvider} in ('stripe', 'none')`
    ),
    index('orders_sweep_claim_expires_idx').on(table.sweepClaimExpiresAt),
    index('idx_orders_user_id_created_at').on(table.userId, table.createdAt),
    index('orders_shipping_status_idx').on(
      table.shippingStatus,
      table.updatedAt
    ),
    index('orders_quote_status_deadline_idx').on(
      table.fulfillmentMode,
      table.quoteStatus,
      table.quotePaymentDeadlineAt
    ),
    index('orders_quote_status_updated_idx').on(
      table.quoteStatus,
      table.updatedAt
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

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    eventName: text('event_name').notNull(),
    eventSource: text('event_source').notNull(),
    eventRef: text('event_ref'),
    attemptId: uuid('attempt_id').references(() => paymentAttempts.id, {
      onDelete: 'set null',
    }),
    providerPaymentIntentId: text('provider_payment_intent_id'),
    providerChargeId: text('provider_charge_id'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: currencyEnum('currency').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    dedupeKey: text('dedupe_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('payment_events_dedupe_key_uq').on(t.dedupeKey),
    index('payment_events_order_id_idx').on(t.orderId),
    index('payment_events_attempt_id_idx').on(t.attemptId),
    index('payment_events_event_ref_idx').on(t.eventRef),
    index('payment_events_occurred_at_idx').on(t.occurredAt),
  ]
);

export const shippingEvents = pgTable(
  'shipping_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shipmentId: uuid('shipment_id').references(() => shippingShipments.id, {
      onDelete: 'set null',
    }),
    provider: text('provider').notNull(),
    eventName: text('event_name').notNull(),
    eventSource: text('event_source').notNull(),
    eventRef: text('event_ref'),
    statusFrom: text('status_from'),
    statusTo: text('status_to'),
    trackingNumber: text('tracking_number'),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    dedupeKey: text('dedupe_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('shipping_events_dedupe_key_uq').on(t.dedupeKey),
    index('shipping_events_order_id_idx').on(t.orderId),
    index('shipping_events_shipment_id_idx').on(t.shipmentId),
    index('shipping_events_occurred_at_idx').on(t.occurredAt),
  ]
);

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    requestId: text('request_id'),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    dedupeKey: text('dedupe_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [
    uniqueIndex('admin_audit_log_dedupe_key_uq').on(t.dedupeKey),
    index('admin_audit_log_order_id_idx').on(t.orderId),
    index('admin_audit_log_actor_user_id_idx').on(t.actorUserId),
    index('admin_audit_log_occurred_at_idx').on(t.occurredAt),
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

export const orderShipping = pgTable(
  'order_shipping',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shippingAddress: jsonb('shipping_address')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [index('order_shipping_updated_idx').on(table.updatedAt)]
);

export const orderLegalConsents = pgTable(
  'order_legal_consents',
  {
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    termsAccepted: boolean('terms_accepted').notNull().default(true),
    privacyAccepted: boolean('privacy_accepted').notNull().default(true),
    termsVersion: text('terms_version').notNull(),
    privacyVersion: text('privacy_version').notNull(),
    consentedAt: timestamp('consented_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    source: text('source').notNull().default('checkout'),
    locale: text('locale'),
    country: varchar('country', { length: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    index('order_legal_consents_consented_idx').on(table.consentedAt),
    check(
      'order_legal_consents_terms_accepted_chk',
      sql`${table.termsAccepted} = true`
    ),
    check(
      'order_legal_consents_privacy_accepted_chk',
      sql`${table.privacyAccepted} = true`
    ),
  ]
);

export const shippingShipments = pgTable(
  'shipping_shipments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: shippingProviderEnum('provider').notNull().default('nova_poshta'),
    status: shippingShipmentStatusEnum('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    providerRef: text('provider_ref'),
    trackingNumber: text('tracking_number'),
    leaseOwner: varchar('lease_owner', { length: 64 }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('shipping_shipments_order_id_uq').on(table.orderId),
    index('shipping_shipments_queue_idx').on(table.status, table.nextAttemptAt),
    index('shipping_shipments_lease_idx').on(table.leaseExpiresAt),
    index('shipping_shipments_provider_ref_idx').on(table.providerRef),
    check(
      'shipping_shipments_attempt_count_non_negative_chk',
      sql`${table.attemptCount} >= 0`
    ),
  ]
);

export const shippingQuotes = pgTable(
  'shipping_quotes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: quoteStatusEnum('status').notNull(),
    currency: currencyEnum('currency').notNull(),
    shippingQuoteMinor: bigint('shipping_quote_minor', {
      mode: 'number',
    }).notNull(),
    offeredBy: text('offered_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    offeredAt: timestamp('offered_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    declinedAt: timestamp('declined_at', { withTimezone: true, mode: 'date' }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('shipping_quotes_order_version_uq').on(
      table.orderId,
      table.version
    ),
    index('shipping_quotes_order_status_idx').on(table.orderId, table.status),
    index('shipping_quotes_status_expires_idx').on(
      table.status,
      table.expiresAt
    ),
    index('shipping_quotes_order_updated_idx').on(
      table.orderId,
      table.updatedAt
    ),
    check('shipping_quotes_version_positive_chk', sql`${table.version} >= 1`),
    check(
      'shipping_quotes_quote_minor_non_negative_chk',
      sql`${table.shippingQuoteMinor} >= 0`
    ),
  ]
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull().default('email'),
    templateKey: text('template_key').notNull(),
    sourceDomain: text('source_domain').notNull(),
    sourceEventId: uuid('source_event_id').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    leaseOwner: varchar('lease_owner', { length: 64 }),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    deadLetteredAt: timestamp('dead_lettered_at', {
      withTimezone: true,
      mode: 'date',
    }),
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  t => [
    uniqueIndex('notification_outbox_dedupe_key_uq').on(t.dedupeKey),
    index('notification_outbox_status_next_attempt_idx').on(
      t.status,
      t.nextAttemptAt
    ),
    index('notification_outbox_status_lease_expires_idx').on(
      t.status,
      t.leaseExpiresAt
    ),
    index('notification_outbox_order_created_idx').on(t.orderId, t.createdAt),
    index('notification_outbox_template_status_idx').on(
      t.templateKey,
      t.status
    ),
    check(
      'notification_outbox_source_domain_chk',
      sql`${t.sourceDomain} in ('shipping_event','payment_event')`
    ),
    check(
      'notification_outbox_status_chk',
      sql`${t.status} in ('pending','processing','sent','failed','dead_letter')`
    ),
    check(
      'notification_outbox_attempt_count_non_negative_chk',
      sql`${t.attemptCount} >= 0`
    ),
    check(
      'notification_outbox_max_attempts_positive_chk',
      sql`${t.maxAttempts} >= 1`
    ),
  ]
);

export const returnRequests = pgTable(
  'return_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: returnRequestStatusEnum('status').notNull().default('requested'),
    reason: text('reason'),
    policyRestock: boolean('policy_restock').notNull().default(true),
    refundAmountMinor: bigint('refund_amount_minor', { mode: 'number' })
      .notNull()
      .default(0),
    currency: currencyEnum('currency').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    approvedBy: text('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
    rejectedBy: text('rejected_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }),
    receivedBy: text('received_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    refundedAt: timestamp('refunded_at', { withTimezone: true, mode: 'date' }),
    refundedBy: text('refunded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    refundProviderRef: text('refund_provider_ref'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    uniqueIndex('return_requests_order_id_uq').on(table.orderId),
    uniqueIndex('return_requests_id_order_id_uq').on(table.id, table.orderId),
    uniqueIndex('return_requests_idempotency_key_uq').on(table.idempotencyKey),
    index('return_requests_status_created_idx').on(
      table.status,
      table.createdAt
    ),
    index('return_requests_user_id_created_idx').on(
      table.userId,
      table.createdAt
    ),
    check(
      'return_requests_refund_amount_minor_non_negative_chk',
      sql`${table.refundAmountMinor} >= 0`
    ),
  ]
);

export const returnItems = pgTable(
  'return_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    returnRequestId: uuid('return_request_id')
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    quantity: integer('quantity').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
    currency: currencyEnum('currency').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('return_items_idempotency_key_uq').on(table.idempotencyKey),
    index('return_items_return_request_idx').on(table.returnRequestId),
    index('return_items_order_id_idx').on(table.orderId),
    index('return_items_product_id_idx').on(table.productId),
    foreignKey({
      name: 'return_items_return_request_order_fk',
      columns: [table.returnRequestId, table.orderId],
      foreignColumns: [returnRequests.id, returnRequests.orderId],
    }).onDelete('cascade'),
    check('return_items_quantity_positive_chk', sql`${table.quantity} > 0`),
    check(
      'return_items_unit_price_minor_non_negative_chk',
      sql`${table.unitPriceMinor} >= 0`
    ),
    check(
      'return_items_line_total_minor_non_negative_chk',
      sql`${table.lineTotalMinor} >= 0`
    ),
    check(
      'return_items_line_total_consistent_chk',
      sql`${table.lineTotalMinor} = (${table.unitPriceMinor} * ${table.quantity})`
    ),
  ]
);

export const npCities = pgTable(
  'np_cities',
  {
    ref: text('ref').primaryKey(),
    nameUa: text('name_ua').notNull(),
    nameRu: text('name_ru'),
    area: text('area'),
    region: text('region'),
    settlementType: text('settlement_type'),
    isActive: boolean('is_active').notNull().default(true),
    lastSyncRunId: uuid('last_sync_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    index('np_cities_active_name_idx').on(table.isActive, table.nameUa),
    index('np_cities_last_sync_run_idx').on(table.lastSyncRunId),
    index('np_cities_active_name_prefix_idx').on(table.isActive, table.nameUa),
  ]
);

export const npWarehouses = pgTable(
  'np_warehouses',
  {
    ref: text('ref').primaryKey(),
    cityRef: text('city_ref').references(() => npCities.ref, {
      onDelete: 'set null',
    }),
    settlementRef: text('settlement_ref'),
    number: text('number'),
    type: text('type'),
    name: text('name').notNull(),
    nameRu: text('name_ru'),
    address: text('address'),
    addressRu: text('address_ru'),
    isPostMachine: boolean('is_post_machine').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    lastSyncRunId: uuid('last_sync_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  table => [
    index('np_warehouses_settlement_active_idx').on(
      table.settlementRef,
      table.isActive
    ),
    index('np_warehouses_city_active_idx').on(table.cityRef, table.isActive),
    index('np_warehouses_active_name_idx').on(table.isActive, table.name),
    index('np_warehouses_last_sync_run_idx').on(table.lastSyncRunId),
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
    janitorClaimedUntil: timestamp('janitor_claimed_until', {
      withTimezone: true,
    }),
    janitorClaimedBy: text('janitor_claimed_by'),

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
    index('payment_attempts_janitor_claim_idx').on(
      t.provider,
      t.status,
      t.janitorClaimedUntil,
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
export type DbPaymentEvent = typeof paymentEvents.$inferSelect;
export type DbShippingEvent = typeof shippingEvents.$inferSelect;
export type DbAdminAuditLog = typeof adminAuditLog.$inferSelect;
export type DbMonobankRefund = typeof monobankRefunds.$inferSelect;
export type DbMonobankPaymentCancel =
  typeof monobankPaymentCancels.$inferSelect;
export type DbOrderShipping = typeof orderShipping.$inferSelect;
export type DbOrderLegalConsent = typeof orderLegalConsents.$inferSelect;
export type DbShippingShipment = typeof shippingShipments.$inferSelect;
export type DbShippingQuote = typeof shippingQuotes.$inferSelect;
export type DbNotificationOutbox = typeof notificationOutbox.$inferSelect;
export type DbReturnRequest = typeof returnRequests.$inferSelect;
export type DbReturnItem = typeof returnItems.$inferSelect;
export type DbNpCity = typeof npCities.$inferSelect;
export type DbNpWarehouse = typeof npWarehouses.$inferSelect;
