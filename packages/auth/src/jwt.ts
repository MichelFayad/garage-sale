// JWT bearer auth for the mobile app + shared API, and the web session cookie.
// Both web (cookie) and mobile (bearer) resolve to the same principal.

import { jwtVerify, SignJWT } from 'jose';
import type { Role } from './roles.js';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface TokenClaims {
  sub: string; // userId
  role: Role;
  accountStatus: AccountStatus;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type TokenKind = 'access' | 'refresh';

/** httpOnly cookie name carrying the web access token. */
export const SESSION_COOKIE = 'gs_session';

function secretFor(kind: TokenKind): Uint8Array {
  const raw = kind === 'access' ? process.env.JWT_ACCESS_SECRET : process.env.JWT_REFRESH_SECRET;
  if (!raw) throw new Error(`Missing ${kind} JWT secret`);
  return new TextEncoder().encode(raw);
}

function ttlFor(kind: TokenKind): number {
  const fallback = kind === 'access' ? 900 : 2_592_000;
  const raw = kind === 'access' ? process.env.JWT_ACCESS_TTL : process.env.JWT_REFRESH_TTL;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function signToken(claims: TokenClaims, kind: TokenKind): Promise<string> {
  return new SignJWT({ role: claims.role, accountStatus: claims.accountStatus })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlFor(kind))
    .sign(secretFor(kind));
}

export async function verifyToken(token: string, kind: TokenKind): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, secretFor(kind));
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.accountStatus !== 'string'
  ) {
    throw new Error('Malformed token claims');
  }
  return {
    sub: payload.sub,
    role: payload.role as Role,
    accountStatus: payload.accountStatus as AccountStatus,
  };
}

/** Issue an access + refresh pair for a principal (login / refresh / OAuth). */
export async function createTokenPair(claims: TokenClaims): Promise<TokenPair> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(claims, 'access'),
    signToken(claims, 'refresh'),
  ]);
  return { accessToken, refreshToken };
}
