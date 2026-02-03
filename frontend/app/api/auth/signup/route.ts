import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema/users';
import { createEmailVerificationToken } from '@/lib/auth/email-verification';
import { sendVerificationEmail } from '@/lib/email/sendVerificationEmail';
import { resolveBaseUrl } from '@/lib/http/getBaseUrl';

export const runtime = 'nodejs';

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: Request) {
  try {
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
        { error: 'Email already in use' },
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
        provider: 'credentials',
        emailVerified: null,
        role: 'user',
      })
      .returning();

    const token = await createEmailVerificationToken(user.id);

    const h = await headers();
    const baseUrl = resolveBaseUrl({
      origin: h.get('origin'),
      host: h.get('host'),
    });

    await sendVerificationEmail({
      to: normalizedEmail,
      verifyUrl: `${baseUrl}/api/auth/verify-email?token=${token}`,
    });

    return NextResponse.json(
      {
        success: true,
        verificationRequired: true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Signup failed', details: message },
      { status: 500 }
    );
  }
}
