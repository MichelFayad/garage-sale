// Session cookie helpers for the web portal. The access token rides the
// httpOnly `gs_session` cookie (read by middleware + tRPC context); the refresh
// token rides `gs_refresh`. Mirrors the cookies the OAuth callback sets.

import type { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@garage-sale/auth';

export const REFRESH_COOKIE = 'gs_refresh';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function setSessionCookies(res: NextResponse, tokens: TokenPair): void {
  const secure = process.env.NODE_ENV === 'production';
  const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
  const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 2_592_000);
  res.cookies.set(SESSION_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: accessTtl,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: refreshTtl,
  });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
}
