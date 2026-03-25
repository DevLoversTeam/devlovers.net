CREATE TABLE IF NOT EXISTS "public"."ai_learned_terms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"term" text NOT NULL,
	"explanation_uk" text NOT NULL,
	"explanation_en" text NOT NULL,
	"explanation_pl" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_learned_terms_user_term_uniq" UNIQUE("user_id","term")
);
--> statement-breakpoint

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'ai_learned_terms_user_id_users_id_fk'
		  AND conrelid = 'public.ai_learned_terms'::regclass
	) THEN
		ALTER TABLE "public"."ai_learned_terms"
		ADD CONSTRAINT "ai_learned_terms_user_id_users_id_fk"
		FOREIGN KEY ("user_id")
		REFERENCES "public"."users"("id")
		ON DELETE cascade
		ON UPDATE no action;
	END IF;
END $$;