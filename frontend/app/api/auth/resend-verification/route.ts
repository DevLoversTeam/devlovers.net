import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema/users";
import { emailVerificationTokens } from "@/db/schema/emailVerificationTokens";
import { createEmailVerificationToken } from "@/lib/auth/email-verification";
import { sendVerificationEmail } from "@/lib/email/sendVerificationEmail";
import { headers } from "next/headers";
import { resolveBaseUrl } from "@/lib/http/getBaseUrl";

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
            emailVerified: users.emailVerified,
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

    if (user.emailVerified) {
        return NextResponse.json({ success: true });
    }

    await db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, user.id));

    const token = await createEmailVerificationToken(user.id);

    const h = await headers();
    const baseUrl = resolveBaseUrl({
        origin: h.get("origin"),
        host: h.get("host"),
    });

    await sendVerificationEmail({
        to: email,
        verifyUrl: `${baseUrl}/api/auth/verify-email?token=${token}`,
    });

    return NextResponse.json({ success: true });
}