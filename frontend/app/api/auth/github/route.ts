import { authEnv } from "@/lib/env/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: authEnv.github.clientId!,
    redirect_uri: authEnv.github.redirectUri!,
    scope: "user:email",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
}