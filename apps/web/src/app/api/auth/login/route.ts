// Single credentials login entry for the marketing /login form. Tries the trader
// path first, then admin staff; on success sets the session cookies and returns
// the role's destination so the client can redirect (staff → /admin, trader →
// /app). OAuth logins use /api/oauth/[provider] instead.

import { NextResponse, type NextRequest } from 'next/server';
import { TRPCError } from '@trpc/server';
import { appRouter, createContext } from '@garage-sale/api';
import { setSessionCookies } from '../../../../lib/session';

const STATUS: Record<string, number> = { UNAUTHORIZED: 401, FORBIDDEN: 403, BAD_REQUEST: 400 };

function errorResponse(err: unknown): NextResponse {
  if (err instanceof TRPCError) {
    return NextResponse.json({ error: err.message }, { status: STATUS[err.code] ?? 400 });
  }
  return NextResponse.json({ error: 'Login failed' }, { status: 400 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const email = String(body.email ?? '');
  const password = String(body.password ?? '');
  const caller = appRouter.createCaller(await createContext({ headers: req.headers }));

  try {
    const { tokens } = await caller.auth.login({ email, password });
    const res = NextResponse.json({ redirect: '/app' });
    setSessionCookies(res, tokens);
    return res;
  } catch (traderErr) {
    // Unknown trader email → maybe staff. Anything else (banned, unverified,
    // wrong password for a real trader) is a genuine failure to surface.
    if (traderErr instanceof TRPCError && traderErr.code === 'UNAUTHORIZED') {
      try {
        const { tokens } = await caller.auth.adminLogin({ email, password });
        const res = NextResponse.json({ redirect: '/admin' });
        setSessionCookies(res, tokens);
        return res;
      } catch {
        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
      }
    }
    return errorResponse(traderErr);
  }
}
