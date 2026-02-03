import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema/users';
import { setAuthCookie, signAuthToken } from '@/lib/auth';
import { consumeOAuthState } from '@/lib/auth/oauth-state';
import { authEnv } from '@/lib/env/auth';

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

type GoogleProfile = {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture: string;
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const state = req.nextUrl.searchParams.get('state');

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: authEnv.google.clientId,
      client_secret: authEnv.google.clientSecret,
      redirect_uri: authEnv.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    console.error('Google token exchange failed', await tokenRes.text());
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;

  const profileRes = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );

  if (!profileRes.ok) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const profile = (await profileRes.json()) as GoogleProfile;

  if (!profile.verified_email) {
    console.warn('Google email not verified', profile);
    return NextResponse.redirect(
      new URL('/login?error=unverified_email', req.url)
    );
  }

  const email = profile.email;
  const googleId = profile.id;

  let user = null;

  const [googleUser] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.providerId, googleId), eq(users.provider, 'google')))
    .limit(1);

  if (googleUser) {
    user = googleUser;
  } else {
    const [emailUser] = await db
      .select({
        id: users.id,
        emailVerified: users.emailVerified,
        image: users.image,
        name: users.name,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (emailUser) {
      const image =
        emailUser.image && emailUser.image !== 'null'
          ? emailUser.image
          : profile.picture;
      const [updatedUser] = await db
        .update(users)
        .set({
          provider: 'google',
          providerId: googleId,
          emailVerified: emailUser.emailVerified ?? new Date(),
          image,
          name: emailUser.name ?? profile.name,
        })
        .where(eq(users.id, emailUser.id))
        .returning();

      user = updatedUser;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email,
          name: profile.name,
          image: profile.picture,
          provider: 'google',
          providerId: googleId,
          emailVerified: new Date(),
        })
        .returning();

      user = created;
    }
  }

  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    role: user.role === 'admin' ? 'admin' : 'user',
  });

  await setAuthCookie(token);

  return NextResponse.redirect(new URL('/dashboard', req.url));
}
