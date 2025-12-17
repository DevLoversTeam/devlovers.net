DROP INDEX IF EXISTS "orders_idempotency_key_idx";--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_user_id_users_id_fk"
      FOREIGN KEY ("user_id")
      REFERENCES "public"."users"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;

