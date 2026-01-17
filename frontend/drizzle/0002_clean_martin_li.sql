CREATE TABLE "active_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "active_sessions_last_activity_idx" ON "active_sessions" USING btree ("last_activity");