import crypto from 'crypto';
import { db } from '@/db';
import { emailVerificationTokens } from '@/db/schema/emailVerificationTokens';

function addHours(date: Date, hours: number) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    return d;
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
