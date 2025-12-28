import { env } from "@/lib/env";
import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: env.google.clientId!,
    redirect_uri: env.google.redirectUri!,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}