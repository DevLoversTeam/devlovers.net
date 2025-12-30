import { authEnv } from "@/lib/env/auth";
import { NextResponse } from "next/server";
import { generateOAuthState, setOAuthStateCookie } from "@/lib/auth/oauth-state";

export async function GET() {
    const state = generateOAuthState();
    await setOAuthStateCookie(state);
    const params = new URLSearchParams({
        client_id: authEnv.github.clientId,
        redirect_uri: authEnv.github.redirectUri,
        scope: "user:email",
        state,
    });

    return NextResponse.redirect(
        `https://github.com/login/oauth/authorize?${params.toString()}`
    );
}