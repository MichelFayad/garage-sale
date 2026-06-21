// Clears the session cookies and points the client back to the login entry.

import { NextResponse } from 'next/server';
import { clearSessionCookies } from '../../../../lib/session';

export function POST(): NextResponse {
  const res = NextResponse.json({ redirect: '/login' });
  clearSessionCookies(res);
  return res;
}
