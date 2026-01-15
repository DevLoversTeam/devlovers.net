import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const passwordResetTokens = pgTable(
    "password_reset_tokens",
    {
        token: text("token").primaryKey(),
        userId: text("user_id").notNull(),
        expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
        createdAt: timestamp("created_at", { mode: "date" })
            .notNull()
            .defaultNow(),
    },
    table => ({
        userIdIdx: index("password_reset_tokens_user_id_idx").on(
            table.userId
        ),
    })
);