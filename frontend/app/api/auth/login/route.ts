import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema/users';
import { setAuthCookie, signAuthToken } from '@/lib/auth';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const result = await db
    .select({
      id: users.id,
      role: users.role,
      passwordHash: users.passwordHash,
      emailVerified: users.emailVerified,
      provider: users.provider,
    })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (result.length === 0) {
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  }

  const user = result[0];

  if (!user.provider) {
    throw new Error('User record missing provider');
  }

  if (user.provider === 'credentials' && user.emailVerified === null) {
    return NextResponse.json(
      {
        error: 'Email is not verified',
        code: 'EMAIL_NOT_VERIFIED',
      },
      { status: 403 }
    );
  }

  if (
    !user.passwordHash ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  }

  const token = signAuthToken({
    userId: result[0].id,
    role: result[0].role as 'user' | 'admin',
    email: normalizedEmail,
  });

  await setAuthCookie(token);
  revalidatePath('/[locale]', 'layout');
  return NextResponse.json({ success: true, userId: result[0].id });
}
