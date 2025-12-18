import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { signAuthToken, setAuthCookie } from "@/lib/auth";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const result = await db
    .select({
      id: users.id,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (
    result.length === 0 ||
    !result[0].passwordHash ||
    !(await bcrypt.compare(password, result[0].passwordHash))
  ) {
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  const token = signAuthToken({
    userId: result[0].id,
    role: result[0].role as "user" | "admin",
    email: normalizedEmail,
  });

  await setAuthCookie(token);

  return NextResponse.json({ success: true });
}