CREATE TABLE "monobank_payment_cancels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ext_ref" text NOT NULL,
	"invoice_id" text NOT NULL,
	"attempt_id" uuid,
	"status" text DEFAULT 'requested' NOT NULL,
	"request_id" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"psp_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monobank_payment_cancels_status_check" CHECK ("monobank_payment_cancels"."status" in ('requested','processing','success','failure'))
);
--> statement-breakpoint
ALTER TABLE "monobank_payment_cancels" ADD CONSTRAINT "monobank_payment_cancels_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "monobank_payment_cancels" ADD CONSTRAINT "monobank_payment_cancels_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "monobank_payment_cancels_ext_ref_unique" ON "monobank_payment_cancels" USING btree ("ext_ref");
--> statement-breakpoint
CREATE INDEX "monobank_payment_cancels_order_id_idx" ON "monobank_payment_cancels" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "monobank_payment_cancels_attempt_id_idx" ON "monobank_payment_cancels" USING btree ("attempt_id");
