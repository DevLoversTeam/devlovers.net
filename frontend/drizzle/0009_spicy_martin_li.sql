ALTER TABLE "monobank_refunds" ALTER COLUMN "amount_minor" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_attempts_provider_status_updated_idx" ON "payment_attempts" USING btree ("provider","status","updated_at");--> statement-breakpoint
ALTER TABLE "monobank_refunds" ADD CONSTRAINT "monobank_refunds_amount_minor_non_negative" CHECK ("monobank_refunds"."amount_minor" >= 0);