ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_provider_valid";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_provider_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" DROP CONSTRAINT "payment_attempts_status_check";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "currency" "currency";--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD COLUMN "expected_amount_minor" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_provider_valid" CHECK ("orders"."payment_provider" in ('stripe', 'monobank', 'none'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_expected_amount_minor_non_negative" CHECK ("payment_attempts"."expected_amount_minor" is null or "payment_attempts"."expected_amount_minor" >= 0);--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_mono_currency_uah" CHECK ("payment_attempts"."provider" <> 'monobank' OR "payment_attempts"."currency" = 'UAH');--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_provider_check" CHECK ("payment_attempts"."provider" in ('stripe','monobank'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_status_check" CHECK ("payment_attempts"."status" in ('creating','active','succeeded','failed','canceled'));