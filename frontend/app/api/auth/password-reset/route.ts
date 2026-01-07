import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { passwordResetTokens } from "@/db/schema/passwordResetTokens";
import { createPasswordResetToken } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";

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

    if (user.provider !== "credentials") {
        return NextResponse.json({ success: true });
    }

    await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

    const token = await createPasswordResetToken(user.id);

    const origin = (await headers()).get("origin");

    await sendPasswordResetEmail({
        to: email,
        resetUrl: `${origin}/reset-password?token=${token}`,
    });

    return NextResponse.json({ success: true });
}