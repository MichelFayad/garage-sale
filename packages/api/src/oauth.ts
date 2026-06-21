// OAuth broker → our JWT. Shared by web (arctic callback) and mobile
// (expo-auth-session). Providers only prove identity; we verify the provider
// token, link/create a User by verified email, and mint our own gs_session pair.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createTokenPair, type OAuthProvider, type TokenPair } from '@garage-sale/auth';
import type { PrismaClient, User } from '@garage-sale/db';

type ErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'BAD_REQUEST';

/** Typed failure surfaced to tRPC (code → TRPCError) and the web callback (→ redirect). */
export class OAuthError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

export interface ProviderIdentity {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoUrl?: string;
}

export interface OAuthExchangeInput {
  provider: OAuthProvider;
  /** OIDC id_token (Google, Apple). */
  idToken?: string;
  /** OAuth2 access token (Facebook Graph). */
  accessToken?: string;
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new OAuthError('BAD_REQUEST', `Missing ${key}`);
  return v;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Apple sends email_verified as boolean or the strings "true"/"false". */
function truthy(v: unknown): boolean {
  return v === true || v === 'true';
}

async function verifyGoogle(idToken: string): Promise<ProviderIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: requireEnv('GOOGLE_CLIENT_ID'),
  });
  const email = asString(payload.email);
  if (!payload.sub || !email) throw new OAuthError('UNAUTHORIZED', 'Google token missing claims');
  return {
    provider: 'GOOGLE',
    providerAccountId: payload.sub,
    email,
    emailVerified: truthy(payload.email_verified),
    displayName: asString(payload.name),
    photoUrl: asString(payload.picture),
  };
}

async function verifyApple(idToken: string): Promise<ProviderIdentity> {
  const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: requireEnv('APPLE_CLIENT_ID'),
  });
  const email = asString(payload.email);
  if (!payload.sub || !email) throw new OAuthError('UNAUTHORIZED', 'Apple token missing claims');
  return {
    provider: 'APPLE',
    providerAccountId: payload.sub,
    email,
    emailVerified: truthy(payload.email_verified),
  };
}

async function verifyFacebook(accessToken: string): Promise<ProviderIdentity> {
  const url = new URL('https://graph.facebook.com/me');
  url.searchParams.set('fields', 'id,name,email,picture');
  url.searchParams.set('access_token', accessToken);
  const res = await fetch(url);
  if (!res.ok) throw new OAuthError('UNAUTHORIZED', 'Facebook token rejected');
  const data = (await res.json()) as {
    id?: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  if (!data.id || !data.email)
    throw new OAuthError('UNAUTHORIZED', 'Facebook profile missing email');
  return {
    provider: 'FACEBOOK',
    providerAccountId: data.id,
    email: data.email,
    emailVerified: true, // Facebook only returns verified emails
    displayName: data.name,
    photoUrl: data.picture?.data?.url,
  };
}

/** Verify a provider token and return the normalised identity. */
export async function verifyProviderToken(input: OAuthExchangeInput): Promise<ProviderIdentity> {
  switch (input.provider) {
    case 'GOOGLE':
      if (!input.idToken) throw new OAuthError('BAD_REQUEST', 'Google requires idToken');
      return verifyGoogle(input.idToken);
    case 'APPLE':
      if (!input.idToken) throw new OAuthError('BAD_REQUEST', 'Apple requires idToken');
      return verifyApple(input.idToken);
    case 'FACEBOOK':
      if (!input.accessToken) throw new OAuthError('BAD_REQUEST', 'Facebook requires accessToken');
      return verifyFacebook(input.accessToken);
    default:
      throw new OAuthError('BAD_REQUEST', 'Unknown provider');
  }
}

/**
 * Resolve the identity to a User: an existing OAuthAccount link, an existing
 * account matched by verified email (account linking), or a new account.
 */
export async function linkOrCreateUser(
  prisma: PrismaClient,
  identity: ProviderIdentity,
): Promise<User> {
  const link = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
      },
    },
    include: { user: true },
  });
  if (link) {
    if (link.user.accountStatus === 'BANNED') throw new OAuthError('FORBIDDEN', 'Account banned');
    return link.user;
  }

  if (!identity.emailVerified) {
    throw new OAuthError('UNAUTHORIZED', 'Provider email is not verified');
  }
  const email = identity.email.toLowerCase();
  const fallbackName = email.split('@')[0] || email;

  let user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    if (user.accountStatus === 'BANNED') throw new OAuthError('FORBIDDEN', 'Account banned');
    // First OAuth on a credentials account verifies the email if it wasn't already.
    if (!user.emailVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
  } else {
    user = await prisma.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        displayName: identity.displayName ?? fallbackName,
        photoUrl: identity.photoUrl ?? null,
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      userId: user.id,
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
    },
  });
  return user;
}

/** End-to-end: verify provider token, link/create the User, mint our token pair. */
export async function oauthSignIn(
  prisma: PrismaClient,
  input: OAuthExchangeInput,
): Promise<{ user: User; tokens: TokenPair }> {
  const identity = await verifyProviderToken(input);
  const user = await linkOrCreateUser(prisma, identity);
  const tokens = await createTokenPair({
    sub: user.id,
    role: 'TRADER',
    accountStatus: user.accountStatus,
  });
  return { user, tokens };
}
