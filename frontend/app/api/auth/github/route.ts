import { env } from "@/lib/env";
import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: env.github.clientId!,
    redirect_uri: env.github.redirectUri!,
    scope: "user:email",
  });

  return NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
}