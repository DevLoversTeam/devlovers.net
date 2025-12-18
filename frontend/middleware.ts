import { NextRequest, NextResponse } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const AUTH_COOKIE_NAME = 'auth_session';

const _AUTH_SECRET = process.env.AUTH_SECRET;

if (!_AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not defined');
}

function isAuthenticated(req: NextRequest): boolean {
  return Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

const intlMiddleware = createIntlMiddleware(routing);

function authMiddleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authenticated = isAuthenticated(req);

  const pathnameWithoutLocale = pathname.replace(/^\/(uk|en|pl)/, '') || '/';

  if (
    (pathnameWithoutLocale === '/login' ||
      pathnameWithoutLocale === '/signup') &&
    authenticated
  ) {
    return NextResponse.redirect(new URL(pathname.split('/').slice(0, 2).join('/') || '/', req.url));
  }

  if (
    pathnameWithoutLocale.startsWith('/leaderboard') ||
    pathnameWithoutLocale.startsWith('/quiz') ||
    pathnameWithoutLocale.startsWith('/dashboard')
  ) {
    if (!authenticated) {
      const locale = pathname.split('/')[1];
      return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
    }
  }

  return null;
}

export function middleware(req: NextRequest) {
  
  const intlResponse = intlMiddleware(req);

  const authResponse = authMiddleware(req);

  if (authResponse) {
    return authResponse;
  }

  return intlResponse;
}

export const config = {
  matcher: ['/', '/(uk|en|pl)/:path*', '/((?!api|_next|.*\\..*).*)',],
};
