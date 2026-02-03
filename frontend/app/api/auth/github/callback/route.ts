import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema/users';
import { setAuthCookie, signAuthToken } from '@/lib/auth';
import { consumeOAuthState } from '@/lib/auth/oauth-state';
import { authEnv } from '@/lib/env/auth';

type GithubTokenResponse = {
  access_token: string;
  token_type: string;
  scope: string;
};

type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
};

type GithubEmail = {
  email: string;
  primary: boolean;
  verified: boolean;
};

const GITHUB_HEADERS = {
  'User-Agent': 'devlovers-app',
};

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');

  if (!(await consumeOAuthState(state))) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: authEnv.github.clientId,
      client_secret: authEnv.github.clientSecret,
      code,
      redirect_uri: authEnv.github.redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    console.error('GitHub token exchange failed', await tokenRes.text());
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const tokenData = (await tokenRes.json()) as GithubTokenResponse;

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const ghUser = (await userRes.json()) as GithubUser;

  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers: {
      ...GITHUB_HEADERS,
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!emailsRes.ok) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const emails = (await emailsRes.json()) as GithubEmail[];

  const primaryEmail = emails.find(e => e.primary && e.verified)?.email;

  if (!primaryEmail) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const githubId = String(ghUser.id);
  let user = null;

  const [githubUser] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.providerId, githubId), eq(users.provider, 'github')))
    .limit(1);

  if (githubUser) {
    user = githubUser;
  } else {
    const [emailUser] = await db
      .select({
        id: users.id,
        emailVerified: users.emailVerified,
        image: users.image,
        name: users.name,
      })
      .from(users)
      .where(eq(users.email, primaryEmail))
      .limit(1);

    if (emailUser) {
      const image =
        emailUser.image && emailUser.image !== 'null'
          ? emailUser.image
          : ghUser.avatar_url;
      const [updatedUser] = await db
        .update(users)
        .set({
          provider: 'github',
          providerId: githubId,
          emailVerified: emailUser.emailVerified ?? new Date(),
          image,
          name: emailUser.name ?? ghUser.name ?? ghUser.login,
        })
        .where(eq(users.id, emailUser.id))
        .returning();

      user = updatedUser;
    } else {
      const [created] = await db
        .insert(users)
        .values({
          email: primaryEmail,
          name: ghUser.name ?? ghUser.login,
          image: ghUser.avatar_url,
          provider: 'github',
          providerId: githubId,
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
