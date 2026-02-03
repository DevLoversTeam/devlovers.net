import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { passwordResetTokens } from '@/db/schema/passwordResetTokens';
import { users } from '@/db/schema/users';
import { createPasswordResetToken } from '@/lib/auth/password-reset';
import { sendPasswordResetEmail } from '@/lib/email/sendPasswordResetEmail';
import { resolveBaseUrl } from '@/lib/http/getBaseUrl';

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ success: true });
  }

  const email = parsed.data.email.toLowerCase();

  const rows = await db
    .select({
      id: users.id,
      provider: users.provider,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ success: true });
  }

  const user = rows[0];

  if (user.provider !== 'credentials') {
    return NextResponse.json({ success: true });
  }

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, user.id));

  const token = await createPasswordResetToken(user.id);

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    origin: h.get('origin'),
    host: h.get('host'),
  });

  await sendPasswordResetEmail({
    to: email,
    resetUrl: `${baseUrl}/reset-password?token=${token}`,
  });
  return NextResponse.json({ success: true });
}
