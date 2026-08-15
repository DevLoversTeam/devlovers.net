import 'server-only';

import { cookies } from 'next/headers';

const LAST_LOGIN_COOKIE = 'last_login_method';
const LAST_LOGIN_MAX_AGE = 60 * 60 * 24 * 365;

export type LastLoginMethod = 'email' | 'google' | 'github';

const VALID_METHODS: readonly LastLoginMethod[] = ['email', 'google', 'github'];

export async function setLastLoginMethodCookie(method: LastLoginMethod) {
  const cookieStore = await cookies();

  cookieStore.set(LAST_LOGIN_COOKIE, method, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LAST_LOGIN_MAX_AGE,
  });
}

export async function getLastLoginMethod(): Promise<LastLoginMethod | null> {
  const cookieStore = await cookies();

  const value = cookieStore.get(LAST_LOGIN_COOKIE)?.value;

  return VALID_METHODS.includes(value as LastLoginMethod)
    ? (value as LastLoginMethod)
    : null;
}
