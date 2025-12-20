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
    (pathnameWithoutLocale === '/login' || pathnameWithoutLocale === '/signup') && authenticated
  ) {
    const locale = pathname.split('/')[1] || 'uk'; 
    return NextResponse.redirect(new URL(`/${locale}/`, req.url)); 
  }

if (pathnameWithoutLocale.startsWith('/dashboard') && !authenticated) {
  const locale = pathname.split('/')[1];
  return NextResponse.redirect(new URL(`/${locale}/login`, req.url));
}

  return null;
}
function getScopeFromPathname(pathname: string): "shop" | "site" {
  const pathnameWithoutLocale = pathname.replace(/^\/(uk|en|pl)(?=\/|$)/, "") || "/"
  return pathnameWithoutLocale.startsWith("/shop") ? "shop" : "site"
}


export function middleware(req: NextRequest) {
  // Force redirect to /uk for root path only
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/uk', req.url))
  }

  const authResponse = authMiddleware(req)
  if (authResponse) return authResponse

  const intlResponse = intlMiddleware(req)
  const scope = getScopeFromPathname(req.nextUrl.pathname)

  // Add scope header to the response
  intlResponse.headers.set("x-app-scope", scope)

  return intlResponse
}


export const config = {
  matcher: [
    // Include all routes except static files, API, and Next.js internals
    '/((?!api|_next|_vercel|.*\\..*).*)',
    '/',
  ],
};
