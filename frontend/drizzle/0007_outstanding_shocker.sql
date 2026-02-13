DROP INDEX IF EXISTS "payment_attempts_order_provider_active_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_order_provider_active_unique"
  ON "payment_attempts" ("order_id","provider")
  WHERE ("status" in ('active','creating'));--> statement-breakpoint