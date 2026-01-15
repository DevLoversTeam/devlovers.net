CREATE TYPE "public"."currency" AS ENUM('USD', 'UAH');--> statement-breakpoint
CREATE TYPE "public"."inventory_move_type" AS ENUM('reserve', 'release');--> statement-breakpoint
CREATE TYPE "public"."inventory_status" AS ENUM('none', 'reserving', 'reserved', 'release_pending', 'released', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('CREATED', 'INVENTORY_RESERVED', 'INVENTORY_FAILED', 'PAID', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'requires_payment', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_badge" AS ENUM('NEW', 'SALE', 'NONE');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"category_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "question_translations" (
	"question_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"question" text NOT NULL,
	"answer_blocks" jsonb NOT NULL,
	CONSTRAINT "question_translations_question_id_locale_pk" PRIMARY KEY("question_id","locale")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"difficulty" varchar(20) DEFAULT 'medium',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answer_translations" (
	"quiz_answer_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"answer_text" text NOT NULL,
	CONSTRAINT "quiz_answer_translations_quiz_answer_id_locale_pk" PRIMARY KEY("quiz_answer_id","locale")
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_question_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"quiz_question_id" uuid NOT NULL,
	"selected_answer_id" uuid,
	"is_correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"quiz_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"time_spent_seconds" integer,
	"integrity_score" integer DEFAULT 100,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_question_content" (
	"quiz_question_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"question_text" text NOT NULL,
	"explanation" jsonb,
	CONSTRAINT "quiz_question_content_quiz_question_id_locale_pk" PRIMARY KEY("quiz_question_id","locale")
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"display_order" integer NOT NULL,
	"source_question_id" uuid,
	"difficulty" varchar(20) DEFAULT 'medium',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_translations" (
	"quiz_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	CONSTRAINT "quiz_translations_quiz_id_locale_pk" PRIMARY KEY("quiz_id","locale")
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"slug" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"questions_count" integer DEFAULT 10 NOT NULL,
	"time_limit_seconds" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_category_id_slug_unique" UNIQUE("category_id","slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"password_hash" text,
	"provider" text DEFAULT 'credentials' NOT NULL,
	"provider_id" text,
	"email_verified" timestamp,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "point_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"source" varchar(50) DEFAULT 'quiz' NOT NULL,
	"source_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internal_job_state" (
	"job_name" text PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone NOT NULL,
	"last_run_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_key" varchar(200) NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "inventory_move_type" NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_moves_quantity_gt_0" CHECK ("inventory_moves"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"selected_size" text DEFAULT '' NOT NULL,
	"selected_color" text DEFAULT '' NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"line_total_minor" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"product_title" text,
	"product_slug" text,
	"product_sku" text,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_minor_non_negative" CHECK ("order_items"."unit_price_minor" >= 0),
	CONSTRAINT "order_items_line_total_minor_non_negative" CHECK ("order_items"."line_total_minor" >= 0),
	CONSTRAINT "order_items_line_total_consistent" CHECK ("order_items"."line_total_minor" = "order_items"."unit_price_minor" * "order_items"."quantity"),
	CONSTRAINT "order_items_unit_price_mirror_consistent" CHECK ("order_items"."unit_price" = ("order_items"."unit_price_minor"::numeric / 100)),
	CONSTRAINT "order_items_line_total_mirror_consistent" CHECK ("order_items"."line_total" = ("order_items"."line_total_minor"::numeric / 100))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"total_amount_minor" integer NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'pending' NOT NULL,
	"payment_provider" text DEFAULT 'stripe' NOT NULL,
	"payment_intent_id" text,
	"psp_charge_id" text,
	"psp_payment_method" text,
	"psp_status_reason" text,
	"psp_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "order_status" DEFAULT 'CREATED' NOT NULL,
	"inventory_status" "inventory_status" DEFAULT 'none' NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"idempotency_request_hash" text,
	"stock_restored" boolean DEFAULT false NOT NULL,
	"restocked_at" timestamp,
	"idempotency_key" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sweep_claimed_at" timestamp,
	"sweep_claim_expires_at" timestamp,
	"sweep_run_id" uuid,
	"sweep_claimed_by" varchar(64),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_payment_provider_valid" CHECK ("orders"."payment_provider" in ('stripe', 'none')),
	CONSTRAINT "orders_total_amount_minor_non_negative" CHECK ("orders"."total_amount_minor" >= 0),
	CONSTRAINT "orders_payment_intent_id_null_when_none" CHECK ("orders"."payment_provider" <> 'none' OR "orders"."payment_intent_id" IS NULL),
	CONSTRAINT "orders_psp_fields_null_when_none" CHECK ("orders"."payment_provider" <> 'none' OR (
        "orders"."psp_charge_id" IS NULL AND
        "orders"."psp_payment_method" IS NULL AND
        "orders"."psp_status_reason" IS NULL
      )),
	CONSTRAINT "orders_total_amount_mirror_consistent" CHECK ("orders"."total_amount" = ("orders"."total_amount_minor"::numeric / 100)),
	CONSTRAINT "orders_payment_status_valid_when_none" CHECK ("orders"."payment_provider" <> 'none' OR "orders"."payment_status" in ('paid','failed'))
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"price_minor" integer NOT NULL,
	"original_price_minor" integer,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_price_positive" CHECK ("product_prices"."price_minor" > 0),
	CONSTRAINT "product_prices_original_price_valid" CHECK ("product_prices"."original_price_minor" is null or "product_prices"."original_price_minor" > "product_prices"."price_minor"),
	CONSTRAINT "product_prices_price_mirror_consistent" CHECK ("product_prices"."price" = ("product_prices"."price_minor"::numeric / 100)),
	CONSTRAINT "product_prices_original_price_null_coupled" CHECK (("product_prices"."original_price_minor" is null) = ("product_prices"."original_price" is null)),
	CONSTRAINT "product_prices_original_price_mirror_consistent" CHECK ("product_prices"."original_price_minor" is null or "product_prices"."original_price" = ("product_prices"."original_price_minor"::numeric / 100))
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_url" text NOT NULL,
	"image_public_id" text,
	"price" numeric(10, 2) NOT NULL,
	"original_price" numeric(10, 2),
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"category" text,
	"type" text,
	"colors" text[] DEFAULT '{}'::text[] NOT NULL,
	"sizes" text[] DEFAULT '{}'::text[] NOT NULL,
	"badge" "product_badge" DEFAULT 'NONE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"sku" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_stock_non_negative" CHECK ("products"."stock" >= 0),
	CONSTRAINT "products_currency_usd_only" CHECK ("products"."currency" = 'USD'),
	CONSTRAINT "products_price_positive" CHECK ("products"."price" > 0),
	CONSTRAINT "products_original_price_valid" CHECK ("products"."original_price" is null or "products"."original_price" > "products"."price")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'stripe' NOT NULL,
	"event_id" text NOT NULL,
	"payment_intent_id" text,
	"order_id" uuid,
	"event_type" text NOT NULL,
	"payment_status" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_translations" ADD CONSTRAINT "question_translations_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answer_translations" ADD CONSTRAINT "quiz_answer_translations_quiz_answer_id_quiz_answers_id_fk" FOREIGN KEY ("quiz_answer_id") REFERENCES "public"."quiz_answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_selected_answer_id_quiz_answers_id_fk" FOREIGN KEY ("selected_answer_id") REFERENCES "public"."quiz_answers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_question_content" ADD CONSTRAINT "quiz_question_content_quiz_question_id_quiz_questions_id_fk" FOREIGN KEY ("quiz_question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_translations" ADD CONSTRAINT "quiz_translations_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_moves" ADD CONSTRAINT "inventory_moves_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_category_sort_order_idx" ON "questions" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX "quiz_answers_question_display_order_idx" ON "quiz_answers" USING btree ("quiz_question_id","display_order");--> statement-breakpoint
CREATE INDEX "quiz_attempt_answers_attempt_idx" ON "quiz_attempt_answers" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_id_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_completed_at_idx" ON "quiz_attempts" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_percentage_completed_at_idx" ON "quiz_attempts" USING btree ("quiz_id","percentage","completed_at");--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_integrity_score_idx" ON "quiz_attempts" USING btree ("quiz_id","integrity_score");--> statement-breakpoint
CREATE INDEX "quiz_questions_quiz_display_order_idx" ON "quiz_questions" USING btree ("quiz_id","display_order");--> statement-breakpoint
CREATE INDEX "quizzes_slug_idx" ON "quizzes" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_provider_id_unique" ON "users" USING btree ("provider","provider_id");--> statement-breakpoint
CREATE INDEX "point_transactions_user_id_idx" ON "point_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_moves_move_key_uq" ON "inventory_moves" USING btree ("move_key");--> statement-breakpoint
CREATE INDEX "inventory_moves_order_id_idx" ON "inventory_moves" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inventory_moves_product_id_idx" ON "inventory_moves" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_variant_uq" ON "order_items" USING btree ("order_id","product_id","selected_size","selected_color");--> statement-breakpoint
CREATE INDEX "orders_sweep_claim_expires_idx" ON "orders" USING btree ("sweep_claim_expires_at");--> statement-breakpoint
CREATE INDEX "product_prices_product_id_idx" ON "product_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_product_currency_uq" ON "product_prices" USING btree ("product_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_events_event_id_idx" ON "stripe_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");