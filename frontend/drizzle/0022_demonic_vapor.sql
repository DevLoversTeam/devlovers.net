CREATE TYPE "public"."fulfillment_mode" AS ENUM('ua_np', 'intl');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('none', 'requested', 'offered', 'accepted', 'declined', 'expired', 'requires_requote');--> statement-breakpoint
CREATE TABLE "shipping_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "quote_status" NOT NULL,
	"currency" "currency" NOT NULL,
	"shipping_quote_minor" bigint NOT NULL,
	"offered_by" text,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_quotes_version_positive_chk" CHECK ("shipping_quotes"."version" >= 1),
	CONSTRAINT "shipping_quotes_quote_minor_non_negative_chk" CHECK ("shipping_quotes"."shipping_quote_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_mode" "fulfillment_mode" DEFAULT 'ua_np' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_status" "quote_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_version" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_quote_minor" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "items_subtotal_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quote_payment_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_offered_by_users_id_fk" FOREIGN KEY ("offered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_quotes_order_version_uq" ON "shipping_quotes" USING btree ("order_id","version");--> statement-breakpoint
CREATE INDEX "shipping_quotes_order_status_idx" ON "shipping_quotes" USING btree ("order_id","status");--> statement-breakpoint
CREATE INDEX "shipping_quotes_status_expires_idx" ON "shipping_quotes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "shipping_quotes_order_updated_idx" ON "shipping_quotes" USING btree ("order_id","updated_at");--> statement-breakpoint
CREATE INDEX "orders_quote_status_deadline_idx" ON "orders" USING btree ("fulfillment_mode","quote_status","quote_payment_deadline_at");--> statement-breakpoint
CREATE INDEX "orders_quote_status_updated_idx" ON "orders" USING btree ("quote_status","updated_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_items_subtotal_minor_non_negative" CHECK ("orders"."items_subtotal_minor" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_quote_minor_non_negative" CHECK ("orders"."shipping_quote_minor" is null or "orders"."shipping_quote_minor" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_intl_provider_restriction_chk" CHECK ("orders"."fulfillment_mode" <> 'intl' OR "orders"."payment_provider" in ('stripe', 'none'));