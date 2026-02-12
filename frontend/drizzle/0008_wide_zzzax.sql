CREATE TABLE "monobank_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'monobank' NOT NULL,
	"event_key" text NOT NULL,
	"invoice_id" text,
	"attempt_id" uuid,
	"order_id" uuid NOT NULL,
	"provider_modified_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"raw_sha256" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monobank_events_provider_check" CHECK ("monobank_events"."provider" in ('monobank'))
);
--> statement-breakpoint
CREATE TABLE "monobank_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'monobank' NOT NULL,
	"order_id" uuid NOT NULL,
	"attempt_id" uuid,
	"ext_ref" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"amount_minor" bigint,
	"currency" "currency" DEFAULT 'UAH' NOT NULL,
	"provider_created_at" timestamp with time zone,
	"provider_modified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monobank_refunds_provider_check" CHECK ("monobank_refunds"."provider" in ('monobank')),
	CONSTRAINT "monobank_refunds_status_check" CHECK ("monobank_refunds"."status" in ('requested','processing','success','failure','needs_review')),
	CONSTRAINT "monobank_refunds_currency_uah" CHECK ("monobank_refunds"."currency" = 'UAH')
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "provider_modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD CONSTRAINT "monobank_events_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monobank_events" ADD CONSTRAINT "monobank_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monobank_refunds" ADD CONSTRAINT "monobank_refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monobank_refunds" ADD CONSTRAINT "monobank_refunds_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monobank_events_event_key_unique" ON "monobank_events" USING btree ("event_key");--> statement-breakpoint
CREATE UNIQUE INDEX "monobank_events_raw_sha256_unique" ON "monobank_events" USING btree ("raw_sha256");--> statement-breakpoint
CREATE INDEX "monobank_events_order_id_idx" ON "monobank_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "monobank_events_attempt_id_idx" ON "monobank_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "monobank_refunds_ext_ref_unique" ON "monobank_refunds" USING btree ("ext_ref");--> statement-breakpoint
CREATE INDEX "monobank_refunds_order_id_idx" ON "monobank_refunds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "monobank_refunds_attempt_id_idx" ON "monobank_refunds" USING btree ("attempt_id");