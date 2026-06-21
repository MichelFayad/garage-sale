import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createTokenPair, SESSION_COOKIE, type TokenClaims, verifyToken } from '@garage-sale/auth';
import { REFRESH_COOKIE, setSessionCookies } from './lib/session';

// Role routing + auth guards for the trader (/app) and admin (/admin) portals.
// Verifies the access cookie (jose — edge safe); when it's missing/expired it
// silently rotates a fresh pair from the refresh cookie so web sessions survive
// past the 15m access TTL. Redirects by role; blocks SUSPENDED/BANNED accounts.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);

  let claims: TokenClaims | null = null;
  let rotated: { accessToken: string; refreshToken: string } | null = null;

  const access = req.cookies.get(SESSION_COOKIE)?.value;
  if (access) {
    try {
      claims = await verifyToken(access, 'access');
    } catch {
      // expired/invalid → fall through to refresh
    }
  }

  if (!claims) {
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    if (refresh) {
      try {
        const rc = await verifyToken(refresh, 'refresh');
        claims = { sub: rc.sub, role: rc.role, accountStatus: rc.accountStatus };
        rotated = await createTokenPair(claims);
      } catch {
        // invalid refresh → unauthenticated
      }
    }
  }

  if (!claims) return NextResponse.redirect(loginUrl);

  let res: NextResponse;
  if (claims.accountStatus !== 'ACTIVE') {
    const blocked = new URL('/login', req.url);
    blocked.searchParams.set('blocked', claims.accountStatus.toLowerCase());
    res = NextResponse.redirect(blocked);
  } else {
    const isAdminArea = pathname.startsWith('/admin');
    const isTrader = claims.role === 'TRADER';
    if (isAdminArea && isTrader) res = NextResponse.redirect(new URL('/app', req.url));
    else if (!isAdminArea && !isTrader) res = NextResponse.redirect(new URL('/admin', req.url));
    else res = NextResponse.next();
  }

  if (rotated) setSessionCookies(res, rotated);
  return res;
}

export const config = {
  matcher: ['/app/:path*', '/admin/:path*'],
};
