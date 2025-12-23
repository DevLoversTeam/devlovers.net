import "dotenv/config";
import bcrypt from "bcryptjs";

import { db, closeDb } from "./index";
import { users } from "./schema";
import { eq } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

async function main() {
  console.log("[seed] Seeding users...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const seedUsers = [
    {
      name: "Admin User",
      email: "admin@example.com",
      passwordHash,
      emailVerified: new Date(),
      role: "admin",
    },
    {
      name: "Test User",
      email: "user@example.com",
      passwordHash,
      emailVerified: null,
      role: "user",
    },
    {
      name: "Google User",
      email: "google@example.com",
      passwordHash: null,
      emailVerified: new Date(),
      role: "user",
    },
  ] as const;

  for (const user of seedUsers) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, user.email))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[seed] Skipping existing user: ${user.email}`);
      continue;
    }

    await db.insert(users).values(user);
    console.log(`[seed] Inserted user: ${user.email}`);
  }

  console.log("[seed] Users seeding completed");
}

main()
  .then(closeDb)
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[seed] Failed:", err);
    try {
      await closeDb();
    } catch {}
    process.exit(1);
  });