ALTER TABLE "quizzes" RENAME COLUMN "topic_id" TO "category_id";--> statement-breakpoint
ALTER TABLE "quizzes" DROP CONSTRAINT "quizzes_topic_id_slug_unique";--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_category_id_slug_unique" UNIQUE("category_id","slug");