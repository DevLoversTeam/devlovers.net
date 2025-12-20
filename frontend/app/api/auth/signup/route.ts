import { NextResponse } from "next/server";
import { revalidatePath } from 'next/cache'; 
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { signAuthToken, setAuthCookie } from "@/lib/auth";

export const runtime = "nodejs";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existingUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingUser.length > 0) {
    return NextResponse.json(
      { error: "Email already in use" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({
      name,
      email: normalizedEmail,
      passwordHash,
      emailVerified: null,
      role: "user",
    })
    .returning({
      id: users.id,
      role: users.role,
    });

  const token = signAuthToken({
    userId: user.id,
    role: user.role as "user" | "admin",
    email: normalizedEmail
  });

  await setAuthCookie(token);
  revalidatePath('/[locale]', 'layout');
  return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
}