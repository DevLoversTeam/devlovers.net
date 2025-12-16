import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  integer,
  numeric,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const productBadgeEnum = pgEnum("product_badge", ["NEW", "SALE", "NONE"])
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "requires_payment",
  "paid",
  "failed",
  "refunded",
])
export const currencyEnum = pgEnum("currency", ["USD"])

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  imagePublicId: text("image_public_id"),
  price: numeric("price", { precision: 10, scale: 2 }).$type<string>().notNull(),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }).$type<string>(),
  currency: currencyEnum("currency").notNull().default("USD"),
  category: text("category"),
  type: text("type"),
  colors: text("colors").array().notNull().default(sql`'{}'::text[]`),
  sizes: text("sizes").array().notNull().default(sql`'{}'::text[]`),
  badge: productBadgeEnum("badge").notNull().default("NONE"),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  stock: integer("stock").notNull().default(0),
  sku: text("sku"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
},
  (table) => {
    return {
      slugUnique: uniqueIndex("products_slug_unique").on(table.slug),
      stockNonNegative: check("products_stock_non_negative", sql`${table.stock} >= 0`),
    }
  })

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).$type<string>().notNull(),
  currency: currencyEnum("currency").notNull().default("USD"),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  paymentProvider: text("payment_provider").notNull().default("stripe"),
  paymentIntentId: text("payment_intent_id"),
  pspChargeId: text("psp_charge_id"),
  pspPaymentMethod: text("psp_payment_method"),
  pspStatusReason: text("psp_status_reason"),
  pspMetadata: jsonb("psp_metadata")
    .$type<Record<string, unknown> | null>()
    .default(sql`'{}'::jsonb`),
  stockRestored: boolean("stock_restored").notNull().default(false),
  restockedAt: timestamp("restocked_at", { mode: "date" }),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
},
  (table) => {
    return {
      idempotencyKeyIdx: uniqueIndex("orders_idempotency_key_idx").on(table.idempotencyKey),
      paymentProviderValid: check(
        "orders_payment_provider_valid",
        sql`${table.paymentProvider} in ('stripe', 'none')`,
      ),
    }
  })

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).$type<string>().notNull(),
  lineTotal: numeric("line_total", { precision: 10, scale: 2 }).$type<string>().notNull(),
  productTitle: text("product_title"),
  productSlug: text("product_slug"),
  productSku: text("product_sku"),
})

export const stripeEvents = pgTable("stripe_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull().default("stripe"),
  eventId: text("event_id").notNull(),
  paymentIntentId: text("payment_intent_id"),
  orderId: uuid("order_id").references(() => orders.id),
  eventType: text("event_type").notNull(),
  paymentStatus: text("payment_status"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
},
  (table) => {
    return {
      // Unique event ID is the idempotency guard for webhook processing (ensure matching DB migration exists).
      eventIdIdx: uniqueIndex("stripe_events_event_id_idx").on(table.eventId),
    }
  })

export type DbOrder = typeof orders.$inferSelect
export type DbOrderItem = typeof orderItems.$inferSelect
