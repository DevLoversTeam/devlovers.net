import crypto from "crypto";
import { db } from "@/db";
import { passwordResetTokens } from "@/db/schema/passwordResetTokens";

function addHours(date: Date, hours: number) {
    const d = new Date();
    d.setHours(d.getHours() + hours);
    return d;
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