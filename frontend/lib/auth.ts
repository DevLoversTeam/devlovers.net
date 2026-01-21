import 'server-only';

import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema/users';

const AUTH_COOKIE_NAME = 'auth_session';
const AUTH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const _AUTH_SECRET = process.env.AUTH_SECRET;

if (!_AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not defined');
}

const AUTH_SECRET: string = _AUTH_SECRET;

export type AuthTokenPayload = {
  userId: string;
  role: 'user' | 'admin';
  email: string;
  exp?: number;
};

export type AuthUser = {
  id: string;
  email: string;
  role: 'user' | 'admin';
  username: string;
};

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, AUTH_SECRET, {
    expiresIn: AUTH_TOKEN_MAX_AGE,
  });
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null) return false;

  if (!('userId' in value) || !('role' in value) || !('email' in value)) {
    return false;
  }

  const v = value as {
    userId: unknown;
    role: unknown;
    email: unknown;
  };

  return (
    typeof v.userId === 'string' &&
    typeof v.email === 'string' &&
    (v.role === 'user' || v.role === 'admin')
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as unknown;

    if (!isAuthTokenPayload(decoded)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_TOKEN_MAX_AGE,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  // 🔍 DEBUG: Немає токена
  if (!token) {
    console.log('[Auth] No token cookie found');
    return null;
  }

  const payload = verifyAuthToken(token);
  // 🔍 DEBUG: Токен невалідний
  if (!payload) {
    console.log('[Auth] Token invalid or verification failed');
    return null;
  }
  // 🔍 DEBUG: Шукаємо в базі
  console.log(`[Auth] Looking for user ID: ${payload.userId}`);

  // ⚠️ Увага: переконайтеся, що тип ID в базі співпадає (string vs number)
  // Якщо в базі ID - це число, а payload.userId - рядок, треба конвертувати
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      username: users.name,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);

  if (result.length === 0) {
    console.warn(
      `[Auth] ⚠️ User ID ${payload.userId} found in token BUT NOT in Database. Probably stale cookie.`
    );
    return null;
  }

  return result[0] as AuthUser;
}
