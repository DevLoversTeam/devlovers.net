CREATE TABLE "user_question_progress" (
	"user_id" text NOT NULL,
	"question_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone,
	"bookmarked_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_question_progress_user_id_question_id_pk" PRIMARY KEY("user_id","question_id"),
	CONSTRAINT "user_question_progress_has_state_check" CHECK ("user_question_progress"."viewed_at" is not null or "user_question_progress"."bookmarked_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "user_question_progress" ADD CONSTRAINT "user_question_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_question_progress" ADD CONSTRAINT "user_question_progress_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_question_progress_user_bookmarked_at_idx" ON "user_question_progress" USING btree ("user_id","bookmarked_at");--> statement-breakpoint
CREATE INDEX "user_question_progress_user_last_opened_at_idx" ON "user_question_progress" USING btree ("user_id","last_opened_at");--> statement-breakpoint
CREATE INDEX "user_question_progress_question_id_idx" ON "user_question_progress" USING btree ("question_id");