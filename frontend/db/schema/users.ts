import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { quizAttempts } from "./quiz";

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .notNull()
      .default(sql`gen_random_uuid()`),

    name: text("name"),

    email: text("email").notNull().unique(),

    passwordHash: text("password_hash"),

    provider: text("provider").notNull().default("credentials"),

    providerId: text("provider_id"),

    emailVerified: timestamp("email_verified", { mode: "date" }),

    image: text("image"),

    role: text("role").notNull().default("user"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  table => ({
    providerProviderIdUq: uniqueIndex(
      "users_provider_provider_id_unique"
    ).on(table.provider, table.providerId),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  quizAttempts: many(quizAttempts),
}));
