import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { AuthTokenPayload } from '@/lib/auth';

const AUTH_COOKIE_NAME = 'auth_session';

const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not defined');
}

function decodeAuthToken(token: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");

  try {
    const json = atob(padded);
    const payload = JSON.parse(json) as Partial<AuthTokenPayload>;
    if (
      typeof payload.userId !== "string" ||
      (payload.role !== "user" && payload.role !== "admin") ||
      typeof payload.email !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}

function isAuthenticated(req: NextRequest): boolean {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return false;

  const payload = decodeAuthToken(token);
  if (!payload) return false;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp > now;
}

const intlMiddleware = createIntlMiddleware(routing);

function authMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authenticated = isAuthenticated(req);

  const pathnameWithoutLocale =
    pathname.replace(/^\/(uk|en|pl)(?=\/|$)/, '') || '/';

  if (pathnameWithoutLocale.startsWith('/dashboard')) {
  if (!authenticated) {
    const locale = pathname.split('/')[1] || 'uk';
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
  }
}

  return null;
}

function getScopeFromPathname(pathname: string): 'shop' | 'site' {
  const pathnameWithoutLocale =
    pathname.replace(/^\/(uk|en|pl)(?=\/|$)/, '') || '/';

  return pathnameWithoutLocale.startsWith('/shop') ? 'shop' : 'site';
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/uk', req.url));
  }

  const locale = req.nextUrl.pathname.split('/')[1] || 'uk';

  const authResponse = authMiddleware(req);
  if (authResponse) return authResponse;

  const intlResponse = intlMiddleware(req);
  const scope = getScopeFromPathname(req.nextUrl.pathname);

  intlResponse.headers.set('x-app-scope', scope);
  intlResponse.headers.set('x-locale', locale);

  return intlResponse;
}

export const config = {
  matcher: ['/', '/(uk|en|pl)/:path*', '/((?!api|_next|.*\\..*).*)'],
};
