CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_name" text NOT NULL,
	"event_source" text NOT NULL,
	"event_ref" text,
	"attempt_id" uuid,
	"provider_payment_intent_id" text,
	"provider_charge_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" "currency" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"shipment_id" uuid,
	"provider" text NOT NULL,
	"event_name" text NOT NULL,
	"event_source" text NOT NULL,
	"event_ref" text,
	"status_from" text,
	"status_to" text,
	"tracking_number" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_events" ADD CONSTRAINT "shipping_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_events" ADD CONSTRAINT "shipping_events_shipment_id_shipping_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipping_shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_audit_log_dedupe_key_uq" ON "admin_audit_log" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "admin_audit_log_order_id_idx" ON "admin_audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_user_id_idx" ON "admin_audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_occurred_at_idx" ON "admin_audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_dedupe_key_uq" ON "payment_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "payment_events_order_id_idx" ON "payment_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_events_attempt_id_idx" ON "payment_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "payment_events_event_ref_idx" ON "payment_events" USING btree ("event_ref");--> statement-breakpoint
CREATE INDEX "payment_events_occurred_at_idx" ON "payment_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shipping_events_dedupe_key_uq" ON "shipping_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "shipping_events_order_id_idx" ON "shipping_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipping_events_shipment_id_idx" ON "shipping_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipping_events_occurred_at_idx" ON "shipping_events" USING btree ("occurred_at");