import { NextRequest, NextResponse } from 'next/server';

const AUTH_COOKIE_NAME = 'auth_session';

const _AUTH_SECRET = process.env.AUTH_SECRET;

if (!_AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not defined');
}

function isAuthenticated(req: NextRequest): boolean {
  return Boolean(req.cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authenticated = isAuthenticated(req);

  if ((pathname === '/login' || pathname === '/signup') && authenticated) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (
    pathname.startsWith('/leaderboard') ||
    pathname.startsWith('/quiz') ||
    pathname.startsWith('/dashboard')
  ) {
    if (!authenticated) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/leaderboard/:path*',
    '/quiz/:path*',
    '/dashboard/:path*',
  ],
};
