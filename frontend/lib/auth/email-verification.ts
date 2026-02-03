import crypto from 'crypto';

import { db } from '@/db';
import { emailVerificationTokens } from '@/db/schema/emailVerificationTokens';

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date.getTime());
  result.setHours(result.getHours() + hours);
  return result;
}

export async function createEmailVerificationToken(userId: string) {
  const token = crypto.randomUUID();

  await db.insert(emailVerificationTokens).values({
    token,
    userId,
    expiresAt: addHours(new Date(), 24),
  });

  return token;
}
