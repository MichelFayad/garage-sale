// OAuth callback — validates state, exchanges the code for a provider token, then
// hands it to the shared `oauthSignIn` (verify → link/create User → our JWT) and
// sets the gs_session cookie. GET serves Google/Facebook; POST serves Apple's
// form_post response.

import { NextResponse, type NextRequest } from 'next/server';
import { OAuthError, oauthSignIn } from '@garage-sale/api';
import { SESSION_COOKIE } from '@garage-sale/auth';
import { prisma } from '@garage-sale/db';
import {
  appleClient,
  facebookClient,
  googleClient,
  isWebProvider,
  STATE_COOKIE,
  toEnumProvider,
  VERIFIER_COOKIE,
  type WebProvider,
} from '../../../../../lib/oauth';

function loginError(req: NextRequest, reason: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
}

async function handle(req: NextRequest, providerParam: string): Promise<NextResponse> {
  if (!isWebProvider(providerParam)) {
    return new NextResponse('Unknown provider', { status: 404 });
  }
  const p: WebProvider = providerParam;

  const source =
    req.method === 'POST'
      ? await req.formData()
      : (req.nextUrl.searchParams as unknown as { get(k: string): string | null });
  const code = String(source.get('code') ?? '');
  const state = String(source.get('state') ?? '');
  const storedState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return loginError(req, 'oauth_state');
  }

  try {
    let idToken: string | undefined;
    let accessToken: string | undefined;

    if (p === 'google') {
      const verifier = req.cookies.get(VERIFIER_COOKIE)?.value ?? '';
      idToken = (await googleClient().validateAuthorizationCode(code, verifier)).idToken();
    } else if (p === 'apple') {
      idToken = (await appleClient().validateAuthorizationCode(code)).idToken();
    } else {
      accessToken = (await facebookClient().validateAuthorizationCode(code)).accessToken();
    }

    const { tokens } = await oauthSignIn(prisma, {
      provider: toEnumProvider(p),
      idToken,
      accessToken,
    });

    const secure = process.env.NODE_ENV === 'production';
    const accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
    const refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 2_592_000);
    const res = NextResponse.redirect(new URL('/app', req.url));
    res.cookies.set(SESSION_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: accessTtl,
    });
    res.cookies.set('gs_refresh', tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshTtl,
    });
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(VERIFIER_COOKIE);
    return res;
  } catch (err) {
    if (err instanceof OAuthError && err.code === 'FORBIDDEN') {
      return loginError(req, 'banned');
    }
    return loginError(req, 'oauth');
  }
}

export function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  return ctx.params.then(({ provider }) => handle(req, provider));
}

export function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  return ctx.params.then(({ provider }) => handle(req, provider));
}
