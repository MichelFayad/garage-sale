// Web OAuth provider clients (arctic). These only run the redirect/code-exchange
// dance; the resulting provider token is handed to @garage-sale/api `oauthSignIn`,
// which verifies it, links/creates the User, and mints our gs_session token pair.

import { Apple, Facebook, Google } from 'arctic';

export type WebProvider = 'google' | 'apple' | 'facebook';
export const WEB_PROVIDERS: readonly WebProvider[] = ['google', 'apple', 'facebook'];

export const STATE_COOKIE = 'gs_oauth_state';
export const VERIFIER_COOKIE = 'gs_oauth_verifier';

export const SCOPES: Record<WebProvider, string[]> = {
  google: ['openid', 'profile', 'email'],
  facebook: ['email', 'public_profile'],
  apple: ['name', 'email'],
};

export function isWebProvider(value: string): value is WebProvider {
  return (WEB_PROVIDERS as readonly string[]).includes(value);
}

export function toEnumProvider(p: WebProvider): 'GOOGLE' | 'APPLE' | 'FACEBOOK' {
  return p.toUpperCase() as 'GOOGLE' | 'APPLE' | 'FACEBOOK';
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function redirectUri(p: WebProvider): string {
  return `${appUrl()}/api/oauth/${p}/callback`;
}

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing ${key}`);
  return v;
}

/** Decode a PKCS#8 PEM private key (Apple sign-in secret) to raw DER bytes. */
function pkcs8FromPem(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(body, 'base64'));
}

export function googleClient(): Google {
  return new Google(env('GOOGLE_CLIENT_ID'), env('GOOGLE_CLIENT_SECRET'), redirectUri('google'));
}

export function facebookClient(): Facebook {
  return new Facebook(
    env('FACEBOOK_CLIENT_ID'),
    env('FACEBOOK_CLIENT_SECRET'),
    redirectUri('facebook'),
  );
}

export function appleClient(): Apple {
  return new Apple(
    env('APPLE_CLIENT_ID'),
    env('APPLE_TEAM_ID'),
    env('APPLE_KEY_ID'),
    pkcs8FromPem(env('APPLE_PRIVATE_KEY')),
    redirectUri('apple'),
  );
}
