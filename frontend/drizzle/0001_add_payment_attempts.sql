CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"attempt_number" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_payment_intent_id" text,
	"last_error_code" text,
	"last_error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "payment_attempts_provider_check" CHECK ("payment_attempts"."provider" in ('stripe')),
	CONSTRAINT "payment_attempts_status_check" CHECK ("payment_attempts"."status" in ('active','succeeded','failed','canceled')),
	CONSTRAINT "payment_attempts_attempt_number_check" CHECK ("payment_attempts"."attempt_number" >= 1)
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_order_provider_attempt_unique" ON "payment_attempts" USING btree ("order_id","provider","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_unique" ON "payment_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_provider_pi_unique" ON "payment_attempts" USING btree ("provider_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_attempts_order_provider_status_idx" ON "payment_attempts" USING btree ("order_id","provider","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_order_provider_active_unique" ON "payment_attempts" USING btree ("order_id","provider") WHERE "payment_attempts"."status" = 'active';