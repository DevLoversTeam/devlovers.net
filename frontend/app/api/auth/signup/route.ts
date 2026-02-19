import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema/users';
import { createEmailVerificationToken } from '@/lib/auth/email-verification';
import {
  EMAIL_MAX_LEN,
  EMAIL_MIN_LEN,
  NAME_MAX_LEN,
  NAME_MIN_LEN,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_POLICY_REGEX,
} from '@/lib/auth/signup-constraints';
import { sendVerificationEmail } from '@/lib/email/sendVerificationEmail';
import { resolveBaseUrl } from '@/lib/http/getBaseUrl';

export const runtime = 'nodejs';

const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(NAME_MIN_LEN, `Name must be at least ${NAME_MIN_LEN} characters`)
      .max(NAME_MAX_LEN, `Name must be at most ${NAME_MAX_LEN} characters`),
    email: z
      .string()
      .trim()
      .min(EMAIL_MIN_LEN, `Email must be at least ${EMAIL_MIN_LEN} characters`)
      .max(EMAIL_MAX_LEN, `Email must be at most ${EMAIL_MAX_LEN} characters`)
      .email('Invalid email'),
    password: z
      .string()
      .min(PASSWORD_MIN_LEN, `Password must be at least ${PASSWORD_MIN_LEN} characters`)
      .max(PASSWORD_MAX_LEN, `Password must be at most ${PASSWORD_MAX_LEN} characters`)
      .regex(/[A-Z]/, 'Password must contain at least one capital letter')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
      .regex(PASSWORD_POLICY_REGEX, 'Password does not meet the required policy'),
    confirmPassword: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
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