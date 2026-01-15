ALTER TABLE "product_prices" DROP CONSTRAINT "product_prices_original_price_valid";--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_minor_non_negative" CHECK ("order_items"."unit_price_minor" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_minor_non_negative" CHECK ("order_items"."line_total_minor" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_line_total_consistent" CHECK ("order_items"."line_total_minor" = "order_items"."unit_price_minor" * "order_items"."quantity");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_intent_id_null_when_none" CHECK ("orders"."payment_provider" <> 'none' OR "orders"."payment_intent_id" IS NULL);--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_original_price_valid" CHECK ("product_prices"."original_price_minor" is null or "product_prices"."original_price_minor" > "product_prices"."price_minor");