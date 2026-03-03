CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"channel" "notification_channel" DEFAULT 'email' NOT NULL,
	"template_key" text NOT NULL,
	"source_domain" text NOT NULL,
	"source_event_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" varchar(64),
	"lease_expires_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"sent_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_source_domain_chk" CHECK ("notification_outbox"."source_domain" in ('shipping_event','payment_event')),
	CONSTRAINT "notification_outbox_status_chk" CHECK ("notification_outbox"."status" in ('pending','processing','sent','failed','dead_letter')),
	CONSTRAINT "notification_outbox_attempt_count_non_negative_chk" CHECK ("notification_outbox"."attempt_count" >= 0),
	CONSTRAINT "notification_outbox_max_attempts_positive_chk" CHECK ("notification_outbox"."max_attempts" >= 1)
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_uq" ON "notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_lease_expires_idx" ON "notification_outbox" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_order_created_idx" ON "notification_outbox" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_template_status_idx" ON "notification_outbox" USING btree ("template_key","status");