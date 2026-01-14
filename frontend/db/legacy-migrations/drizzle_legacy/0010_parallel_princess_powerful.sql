DROP INDEX "quiz_attempts_user_id_idx";--> statement-breakpoint
DROP INDEX "quiz_attempts_quiz_id_idx";--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "points_earned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "point_transactions_user_id_idx" ON "point_transactions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "points";