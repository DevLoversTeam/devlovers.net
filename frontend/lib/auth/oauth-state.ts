import { cookies } from "next/headers";
import crypto from "crypto";

const STATE_COOKIE = "oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

export function generateOAuthState(): string {
    return crypto.randomBytes(32).toString("hex");
}

export async function setOAuthStateCookie(state: string) {
    const store = await cookies();
    store.set(STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: STATE_TTL_SECONDS,
    });
}

export async function consumeOAuthState(expected: string | null): Promise<boolean> {
    const store = await cookies();
    const actual = store.get(STATE_COOKIE)?.value;

    store.delete(STATE_COOKIE);

    if (!expected || !actual) return false;
    return crypto.timingSafeEqual(
        Buffer.from(actual),
        Buffer.from(expected)
    );
}