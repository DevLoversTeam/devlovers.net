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
function getScopeFromPathname(pathname: string): "shop" | "site" {
  const pathnameWithoutLocale = pathname.replace(/^\/(uk|en|pl)(?=\/|$)/, "") || "/"
  return pathnameWithoutLocale.startsWith("/shop") ? "shop" : "site"
}


export function middleware(req: NextRequest) {
  const authResponse = authMiddleware(req)
  if (authResponse) return authResponse

  const intlResponse = intlMiddleware(req)
  const scope = getScopeFromPathname(req.nextUrl.pathname)

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-app-scope", scope)


  const isRewriteOrRedirect = intlResponse.headers.has("location") || intlResponse.headers.has("x-middleware-rewrite")
  if (isRewriteOrRedirect) {
    intlResponse.headers.set("x-app-scope", scope)
    return intlResponse
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}



export const config = {
  matcher: ['/', '/(uk|en|pl)/:path*', '/((?!api|_next|.*\\..*).*)',],
};
