CREATE TABLE "order_legal_consents" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"terms_accepted" boolean DEFAULT true NOT NULL,
	"privacy_accepted" boolean DEFAULT true NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'checkout' NOT NULL,
	"locale" text,
	"country" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_legal_consents_terms_accepted_chk" CHECK ("order_legal_consents"."terms_accepted" = true),
	CONSTRAINT "order_legal_consents_privacy_accepted_chk" CHECK ("order_legal_consents"."privacy_accepted" = true)
);
--> statement-breakpoint
ALTER TABLE "order_legal_consents" ADD CONSTRAINT "order_legal_consents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_legal_consents_consented_idx" ON "order_legal_consents" USING btree ("consented_at");