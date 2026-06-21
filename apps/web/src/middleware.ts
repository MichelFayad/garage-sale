import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyToken } from '@garage-sale/auth';

// Role routing + auth guards for the trader (/app) and admin (/admin) portals.
// Reads the JWT session cookie (jose verify — edge safe), redirects by role,
// and blocks SUSPENDED/BANNED accounts. Unauthenticated users go to /login.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);

  if (!token) return NextResponse.redirect(loginUrl);

  let role: string;
  let accountStatus: string;
  try {
    const claims = await verifyToken(token, 'access');
    role = claims.role;
    accountStatus = claims.accountStatus;
  } catch {
    return NextResponse.redirect(loginUrl);
  }

  if (accountStatus !== 'ACTIVE') {
    const blocked = new URL('/login', req.url);
    blocked.searchParams.set('blocked', accountStatus.toLowerCase());
    return NextResponse.redirect(blocked);
  }

  const isAdminArea = pathname.startsWith('/admin');
  const isTrader = role === 'TRADER';

  // Wrong portal for the role → send to the right one.
  if (isAdminArea && isTrader) return NextResponse.redirect(new URL('/app', req.url));
  if (!isAdminArea && !isTrader) return NextResponse.redirect(new URL('/admin', req.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*'],
};
