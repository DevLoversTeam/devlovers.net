CREATE TYPE "public"."shipping_method_code" AS ENUM('NP_WAREHOUSE', 'NP_LOCKER', 'NP_COURIER');--> statement-breakpoint
CREATE TYPE "public"."shipping_payer" AS ENUM('customer', 'merchant');--> statement-breakpoint
CREATE TYPE "public"."shipping_provider" AS ENUM('nova_poshta', 'ukrposhta');--> statement-breakpoint
CREATE TYPE "public"."shipping_shipment_status" AS ENUM('queued', 'processing', 'succeeded', 'failed', 'needs_attention');--> statement-breakpoint
CREATE TYPE "public"."shipping_status" AS ENUM('pending', 'queued', 'creating_label', 'label_created', 'shipped', 'delivered', 'cancelled', 'needs_attention');--> statement-breakpoint
CREATE TABLE "np_cities" (
	"ref" text PRIMARY KEY NOT NULL,
	"name_ua" text NOT NULL,
	"name_ru" text,
	"area" text,
	"region" text,
	"settlement_type" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "np_warehouses" (
	"ref" text PRIMARY KEY NOT NULL,
	"city_ref" text,
	"settlement_ref" text,
	"number" text,
	"type" text,
	"name" text NOT NULL,
	"name_ru" text,
	"address" text,
	"address_ru" text,
	"is_post_machine" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_shipping" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"shipping_address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" "shipping_provider" DEFAULT 'nova_poshta' NOT NULL,
	"status" "shipping_shipment_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"provider_ref" text,
	"tracking_number" text,
	"lease_owner" varchar(64),
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_required" boolean;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_payer" "shipping_payer";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_provider" "shipping_provider";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method_code" "shipping_method_code";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_status" "shipping_status";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_provider_ref" text;--> statement-breakpoint
ALTER TABLE "np_warehouses" ADD CONSTRAINT "np_warehouses_settlement_ref_np_cities_ref_fk" FOREIGN KEY ("settlement_ref") REFERENCES "public"."np_cities"("ref") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipping" ADD CONSTRAINT "order_shipping_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_shipments" ADD CONSTRAINT "shipping_shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "np_cities_active_name_idx" ON "np_cities" USING btree ("is_active","name_ua");--> statement-breakpoint
CREATE INDEX "np_cities_last_sync_run_idx" ON "np_cities" USING btree ("last_sync_run_id");--> statement-breakpoint
CREATE INDEX "np_warehouses_settlement_active_idx" ON "np_warehouses" USING btree ("settlement_ref","is_active");--> statement-breakpoint
CREATE INDEX "np_warehouses_city_active_idx" ON "np_warehouses" USING btree ("city_ref","is_active");--> statement-breakpoint
CREATE INDEX "np_warehouses_active_name_idx" ON "np_warehouses" USING btree ("is_active","name");--> statement-breakpoint
CREATE INDEX "np_warehouses_last_sync_run_idx" ON "np_warehouses" USING btree ("last_sync_run_id");--> statement-breakpoint
CREATE INDEX "order_shipping_updated_idx" ON "order_shipping" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_shipments_order_id_uq" ON "shipping_shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipping_shipments_queue_idx" ON "shipping_shipments" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "shipping_shipments_lease_idx" ON "shipping_shipments" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "shipping_shipments_provider_ref_idx" ON "shipping_shipments" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "orders_shipping_status_idx" ON "orders" USING btree ("shipping_status","updated_at");--> statement-breakpoint
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_shipping_amount_minor_customer_null"
  CHECK (
    "shipping_payer" IS DISTINCT FROM 'customer'::"shipping_payer"
    OR "shipping_amount_minor" IS NULL
  ) NOT VALID;--> statement-breakpoint
ALTER TABLE "shipping_shipments"
  ADD CONSTRAINT "shipping_shipments_attempt_count_non_negative"
  CHECK ("attempt_count" >= 0) NOT VALID;
