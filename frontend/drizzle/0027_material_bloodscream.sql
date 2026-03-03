CREATE TABLE "blog_author_translations" (
	"author_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"job_title" text,
	"company" text,
	"city" text,
	CONSTRAINT "blog_author_translations_author_id_locale_pk" PRIMARY KEY("author_id","locale")
);
--> statement-breakpoint
CREATE TABLE "blog_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"image_url" text,
	"image_public_id" text,
	"social_media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(50) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "blog_category_translations" (
	"category_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	CONSTRAINT "blog_category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "blog_post_categories" (
	"post_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "blog_post_categories_post_id_category_id_pk" PRIMARY KEY("post_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "blog_post_translations" (
	"post_id" uuid NOT NULL,
	"locale" varchar(5) NOT NULL,
	"title" text NOT NULL,
	"body" jsonb,
	CONSTRAINT "blog_post_translations_post_id_locale_pk" PRIMARY KEY("post_id","locale")
);
--> statement-breakpoint
CREATE TABLE "blog_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(200) NOT NULL,
	"author_id" uuid,
	"main_image_url" text,
	"main_image_public_id" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"resource_link" text,
	"published_at" timestamp with time zone,
	"scheduled_publish_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blog_author_translations" ADD CONSTRAINT "blog_author_translations_author_id_blog_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."blog_authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_category_translations" ADD CONSTRAINT "blog_category_translations_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_categories" ADD CONSTRAINT "blog_post_categories_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_categories" ADD CONSTRAINT "blog_post_categories_category_id_blog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."blog_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_post_translations" ADD CONSTRAINT "blog_post_translations_post_id_blog_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD CONSTRAINT "blog_posts_author_id_blog_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."blog_authors"("id") ON DELETE set null ON UPDATE no action;