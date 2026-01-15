import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { passwordResetTokens } from "@/db/schema/passwordResetTokens";


const schema = z.object({
    token: z.string().uuid(),
    password: z.string().min(8),
});

export async function POST(req: Request) {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid request" },
            { status: 400 }
        );
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
            { error: "Invalid or expired token" },
            { status: 400 }
        );
    }

    const { userId, expiresAt } = rows[0];

    if (expiresAt < new Date()) {
        await db
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.token, token));

        return NextResponse.json(
            { error: "Invalid or expired token" },
            { status: 400 }
        );
    }

    const passwordHash = await bcrypt.hash(password, 10);


    await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));

    await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId));

    return NextResponse.json({ success: true });
}