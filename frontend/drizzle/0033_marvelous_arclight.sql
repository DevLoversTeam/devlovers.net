CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"image_public_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_sort_order_non_negative" CHECK ("product_images"."sort_order" >= 0),
	CONSTRAINT "product_images_image_url_non_blank" CHECK (length(btrim("product_images"."image_url")) > 0)
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_sort_order_uq" ON "product_images" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_one_primary_per_product_uq" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_primary";--> statement-breakpoint

INSERT INTO "product_images" (
	"product_id",
	"image_url",
	"image_public_id",
	"sort_order",
	"is_primary",
	"created_at",
	"updated_at"
)
SELECT
	"p"."id",
	"p"."image_url",
	"p"."image_public_id",
	0,
	true,
	"p"."created_at",
	"p"."updated_at"
FROM "products" "p"
WHERE length(btrim(coalesce("p"."image_url", ''))) > 0;--> statement-breakpoint

CREATE OR REPLACE FUNCTION shop_product_images_primary_guardrail()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	affected_product_id uuid;
	image_count integer;
	primary_count integer;
BEGIN
	affected_product_id := coalesce(NEW.product_id, OLD.product_id);

	SELECT
		count(*)::integer,
		count(*) FILTER (WHERE is_primary)::integer
	INTO image_count, primary_count
	FROM product_images
	WHERE product_id = affected_product_id;

	IF image_count > 0 AND primary_count <> 1 THEN
		RAISE EXCEPTION
			USING errcode = '23514',
			      constraint = 'product_images_exactly_one_primary_chk',
			      message = 'product_images require exactly one primary image per product when rows exist';
	END IF;

	RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER product_images_exactly_one_primary_guardrail
AFTER INSERT OR UPDATE OR DELETE ON "product_images"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION shop_product_images_primary_guardrail();--> statement-breakpoint

CREATE OR REPLACE FUNCTION shop_sync_product_image_mirror()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	affected_product_id uuid;
BEGIN
	affected_product_id := coalesce(NEW.product_id, OLD.product_id);

	UPDATE products p
	SET
		image_url = coalesce(
			(
				SELECT pi.image_url
				FROM product_images pi
				WHERE pi.product_id = affected_product_id
				  AND pi.is_primary IS TRUE
				ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
				LIMIT 1
			),
			''
		),
		image_public_id = (
			SELECT pi.image_public_id
			FROM product_images pi
			WHERE pi.product_id = affected_product_id
			  AND pi.is_primary IS TRUE
			ORDER BY pi.sort_order ASC, pi.created_at ASC, pi.id ASC
			LIMIT 1
		),
		updated_at = now()
	WHERE p.id = affected_product_id;

	RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER product_images_sync_product_legacy_fields
AFTER INSERT OR UPDATE OR DELETE ON "product_images"
FOR EACH ROW
EXECUTE FUNCTION shop_sync_product_image_mirror();
