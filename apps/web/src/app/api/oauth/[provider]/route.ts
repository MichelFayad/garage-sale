// OAuth start — redirects the browser to the provider with CSRF state (and PKCE
// verifier for Google). Cookies carry state/verifier across the round trip.

import { NextResponse, type NextRequest } from 'next/server';
import { generateCodeVerifier, generateState } from 'arctic';
import {
  appleClient,
  facebookClient,
  googleClient,
  isWebProvider,
  SCOPES,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  type WebProvider,
} from '../../../../lib/oauth';

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (!isWebProvider(provider)) {
    return new NextResponse('Unknown provider', { status: 404 });
  }
  const p: WebProvider = provider;
  const state = generateState();
  let url: URL;
  let verifier: string | null = null;

  try {
    if (p === 'google') {
      verifier = generateCodeVerifier();
      url = googleClient().createAuthorizationURL(state, verifier, SCOPES.google);
    } else if (p === 'facebook') {
      url = facebookClient().createAuthorizationURL(state, SCOPES.facebook);
    } else {
      url = appleClient().createAuthorizationURL(state, SCOPES.apple);
      // Apple returns name/email scopes via a cross-site POST.
      url.searchParams.set('response_mode', 'form_post');
    }
  } catch {
    return NextResponse.redirect(new URL('/login?error=oauth_unconfigured', req.url));
  }

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    // Apple's cross-site POST callback needs SameSite=None (forces Secure).
    secure: secure || p === 'apple',
    sameSite: p === 'apple' ? 'none' : 'lax',
    path: '/',
    maxAge: 600,
  });
  if (verifier) {
    res.cookies.set(VERIFIER_COOKIE, verifier, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  }
  return res;
}
