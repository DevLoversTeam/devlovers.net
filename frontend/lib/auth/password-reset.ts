import crypto from "crypto";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema/passwordResetTokens";

export function addHours(date: Date, hours: number): Date {
    const result = new Date(date.getTime());
    result.setHours(result.getHours() + hours);
    return result;
}

export async function createPasswordResetToken(
    userId: string
) {
    const token = crypto.randomUUID();

    await db.insert(passwordResetTokens).values({
        token,
        userId,
        expiresAt: addHours(new Date(), 1),
    });

    return token;
}