CREATE TYPE "public"."return_request_status" AS ENUM('requested', 'approved', 'rejected', 'received', 'refunded');--> statement-breakpoint
CREATE TABLE "return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_request_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"product_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_items_quantity_positive_chk" CHECK ("return_items"."quantity" > 0),
	CONSTRAINT "return_items_unit_price_minor_non_negative_chk" CHECK ("return_items"."unit_price_minor" >= 0),
	CONSTRAINT "return_items_line_total_minor_non_negative_chk" CHECK ("return_items"."line_total_minor" >= 0),
	CONSTRAINT "return_items_line_total_consistent_chk" CHECK ("return_items"."line_total_minor" = ("return_items"."unit_price_minor" * "return_items"."quantity"))
);
--> statement-breakpoint
CREATE TABLE "return_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" text,
	"status" "return_request_status" DEFAULT 'requested' NOT NULL,
	"reason" text,
	"policy_restock" boolean DEFAULT true NOT NULL,
	"refund_amount_minor" bigint DEFAULT 0 NOT NULL,
	"currency" "currency" NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"rejected_at" timestamp with time zone,
	"rejected_by" text,
	"received_at" timestamp with time zone,
	"received_by" text,
	"refunded_at" timestamp with time zone,
	"refunded_by" text,
	"refund_provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_requests_refund_amount_minor_non_negative_chk" CHECK ("return_requests"."refund_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_request_id_return_requests_id_fk" FOREIGN KEY ("return_request_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_refunded_by_users_id_fk" FOREIGN KEY ("refunded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "return_items_idempotency_key_uq" ON "return_items" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "return_items_return_request_idx" ON "return_items" USING btree ("return_request_id");--> statement-breakpoint
CREATE INDEX "return_items_order_id_idx" ON "return_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "return_items_product_id_idx" ON "return_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_requests_order_id_uq" ON "return_requests" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_requests_idempotency_key_uq" ON "return_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "return_requests_status_created_idx" ON "return_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "return_requests_user_id_created_idx" ON "return_requests" USING btree ("user_id","created_at");