import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { passwordResetTokens } from '@/db/schema/passwordResetTokens';
import { users } from '@/db/schema/users';
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_POLICY_REGEX,
} from '@/lib/auth/signup-constraints';

const schema = z.object({
  token: z.string().uuid(),
  password: z
    .string()
    .min(
      PASSWORD_MIN_LEN,
      `Password must be at least ${PASSWORD_MIN_LEN} characters`
    )
    .max(
      PASSWORD_MAX_LEN,
      `Password must be at most ${PASSWORD_MAX_LEN} characters`
    )
    .regex(/[A-Z]/, 'Password must contain at least one capital letter')
    .regex(
      /[^A-Za-z0-9]/,
      'Password must contain at least one special character'
    )
    .regex(PASSWORD_POLICY_REGEX, 'Password does not meet the required policy'),
});

function firstFieldErrorMessage(
  fieldErrors: Record<string, string[] | undefined>
): string | null {
  for (const key of Object.keys(fieldErrors)) {
    const msgs = fieldErrors[key];
    if (Array.isArray(msgs) && msgs.length > 0 && msgs[0]) {
      return msgs[0];
    }
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    const firstMsg =
      firstFieldErrorMessage(flattened) ?? 'Invalid request';
    return NextResponse.json({ error: firstMsg }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const rows = await db
    .select({
      userId: passwordResetTokens.userId,
      expiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 400 }
    );
  }

  const { userId, expiresAt } = rows[0];

  if (expiresAt < new Date()) {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));

    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.token, token));

  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}