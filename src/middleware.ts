import { NextResponse, type NextRequest } from 'next/server';

// Lightweight Edge-compatible middleware.
// Real role check happens in route handlers (where we can import DB / call auth()).
// This just performs a presence check on the NextAuth session cookie when AUTH is configured.

const AUTH_CONFIGURED = !!process.env.AUTH_GITHUB_ID;

const SESSION_COOKIE_NAMES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  // legacy v4 names if upgraded
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
];

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');
  if (!isAdminPath) return NextResponse.next();
  if (!AUTH_CONFIGURED) return NextResponse.next(); // dev mode

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((n) => !!req.cookies.get(n)?.value);
  if (!hasSessionCookie) {
    const url = new URL('/?signin=required', req.url);
    return NextResponse.redirect(url);
  }
  // Detailed role check happens in route handlers via `await auth()`
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
