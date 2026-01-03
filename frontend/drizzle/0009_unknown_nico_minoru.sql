ALTER TABLE "orders" ALTER COLUMN "psp_metadata" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "questions_category_sort_order_idx" ON "questions" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quizzes_slug_idx" ON "quizzes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_provider_id_unique" ON "users" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "product_prices_product_id_idx" ON "product_prices" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_mirror_consistent" CHECK ("order_items"."unit_price" = ("order_items"."unit_price_minor"::numeric / 100));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_mirror_consistent" CHECK ("order_items"."line_total" = ("order_items"."line_total_minor"::numeric / 100));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_amount_mirror_consistent" CHECK ("orders"."total_amount" = ("orders"."total_amount_minor"::numeric / 100));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_paid_when_none" CHECK ("orders"."payment_provider" <> 'none' OR "orders"."payment_status" = 'paid');--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_mirror_consistent" CHECK ("product_prices"."price" = ("product_prices"."price_minor"::numeric / 100));--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_original_price_null_coupled" CHECK (("product_prices"."original_price_minor" is null) = ("product_prices"."original_price" is null));--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_original_price_mirror_consistent" CHECK ("product_prices"."original_price_minor" is null or "product_prices"."original_price" = ("product_prices"."original_price_minor"::numeric / 100));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_currency_usd_only" CHECK ("products"."currency" = 'USD');--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("products"."price" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_original_price_valid" CHECK ("products"."original_price" is null or "products"."original_price" > "products"."price");