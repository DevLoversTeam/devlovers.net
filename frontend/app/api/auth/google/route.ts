import { authEnv } from "@/lib/env/auth";
import { NextResponse } from "next/server";
import {
  generateOAuthState,
  setOAuthStateCookie,
} from "@/lib/auth/oauth-state";


export async function GET() {
  const { clientId, redirectUri } = authEnv.google

  if (!clientId || !redirectUri) {
    throw new Error("Google OAuth is not properly configured");
  }

  const state = generateOAuthState();
  await setOAuthStateCookie(state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}