import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
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

    points: integer("points").notNull().default(0),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  table => ({
    providerProviderIdIdx: index("users_provider_provider_id_idx").on(
      table.provider,
      table.providerId
    ),
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  quizAttempts: many(quizAttempts),
}));
