CREATE UNIQUE INDEX "return_requests_id_order_id_uq"
  ON "return_requests" USING btree ("id","order_id");
--> statement-breakpoint
ALTER TABLE "return_items"
  ADD CONSTRAINT "return_items_return_request_order_fk"
  FOREIGN KEY ("return_request_id","order_id")
  REFERENCES "public"."return_requests"("id","order_id")
  ON DELETE cascade
  ON UPDATE no action;