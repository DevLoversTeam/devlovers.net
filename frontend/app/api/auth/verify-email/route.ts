import { NextRequest, NextResponse } from "next/server";
import { eq, and, lt } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { emailVerificationTokens } from "@/db/schema/emailVerificationTokens";

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token");

    if (!token) {
        return NextResponse.redirect(
            new URL("/login?error=invalid_token", req.url)
        );
    }

    const now = new Date();

    const rows = await db
        .select({
            userId: emailVerificationTokens.userId,
            expiresAt: emailVerificationTokens.expiresAt,
        })
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.token, token))
        .limit(1);

    if (rows.length === 0) {
        return NextResponse.redirect(
            new URL("/login?error=invalid_token", req.url)
        );
    }

    const { userId, expiresAt } = rows[0];

    if (expiresAt < now) {
        await db
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.token, token));

        return NextResponse.redirect(
            new URL("/login?error=token_expired", req.url)
        );
    }

    await db.transaction(async tx => {
        await tx
            .update(users)
            .set({ emailVerified: now })
            .where(eq(users.id, userId));

        await tx
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.token, token));
    });

    return NextResponse.redirect(
        new URL("/login?verified=1", req.url)
    );
}